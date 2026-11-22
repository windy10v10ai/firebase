using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;

namespace Windy10v10AI.Launcher
{
    enum SettlementState
    {
        None = 0,
        Sending = 1,
        SentAll = 2,
        Partial = 3,
        Failed = 4
    }

    sealed class SettlementPart
    {
        public long SteamId;
        public Dictionary<string, object> Body;
        public Dictionary<string, object> Player;
    }

    sealed class SettlementBatch
    {
        public string MatchKey;
        public int Expected;
        public bool HasSummary;
        public List<SettlementPart> Parts = new List<SettlementPart>();
    }

    // Reads the per-player settlement lines the game writes after a match. A batch is only handed out once the
    // game's own end marker or summary has been seen, so a data line alone never counts as the end of the game;
    // a key switch hands out whatever the previous match already completed.
    sealed class SettlementLog
    {
        const int MaxLineChars = 512 * 1024;
        const int MaxBodyBytes = 256 * 1024;
        const int MaxPlayers = 20;
        const int MaxSegments = 200;
        const int MaxBufferedBytes = 16 * 1024 * 1024;
        const int MaxMatchKeyChars = 128;

        static readonly Regex DataLine = new Regex(
            @"\[WSettle\]\s+v1\s+(\S+)\s+(\d{1,20})\s+(\d{1,3})/(\d{1,3})\s+([A-Za-z0-9_\-]+={0,2})\s*$",
            RegexOptions.CultureInvariant);
        static readonly Regex DoneLine = new Regex(
            @"\[WSettle\]\s+done\s+v1\s+(\S+)\s+(\d{1,3})\s*$",
            RegexOptions.CultureInvariant);

        readonly JavaScriptSerializer serializer = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
        readonly Dictionary<long, PlayerParts> players = new Dictionary<long, PlayerParts>();
        // Batches finished by a key change, handed out after the one being assembled
        readonly List<SettlementBatch> ready = new List<SettlementBatch>();
        string pending = "";
        string matchKey;
        string finishedKey;
        int expected;
        bool summary;
        bool endSeen;
        bool doneSeen;
        int bufferedBytes;

        sealed class PlayerParts
        {
            public long SteamId;
            public int Total;
            // Segments are chunks of one base64url text, not separate JSON bodies.
            public readonly Dictionary<int, string> Segments = new Dictionary<int, string>();

            public bool Complete
            {
                get
                {
                    if (Total < 1 || Segments.Count != Total) return false;
                    for (var seq = 1; seq <= Total; seq++)
                    {
                        if (!Segments.ContainsKey(seq)) return false;
                    }
                    return true;
                }
            }
        }

        public SettlementBatch Feed(string chunk)
        {
            if (chunk == null) chunk = "";
            pending += chunk;
            while (true)
            {
                var at = pending.IndexOf('\n');
                if (at < 0) break;
                var line = pending.Substring(0, at);
                pending = pending.Substring(at + 1);
                if (line.EndsWith("\r", StringComparison.Ordinal)) line = line.Substring(0, line.Length - 1);
                Handle(line);
            }
            // A line this long cannot be one of ours, so drop it rather than letting the buffer grow without bound.
            if (pending.Length > MaxLineChars) pending = "";
            if (endSeen || doneSeen)
            {
                var batch = Build();
                if (batch != null)
                {
                    finishedKey = batch.MatchKey;
                    ResetActive();
                    ready.Add(batch);
                }
            }
            if (ready.Count == 0) return null;
            var next = ready[0];
            ready.RemoveAt(0);
            return next;
        }

        // Ends a round whose last line was cut off, so the complete players already read are not held back.
        public SettlementBatch Finish()
        {
            var batch = Build();
            if (batch == null) return null;
            finishedKey = batch.MatchKey;
            ready.Clear();
            ResetActive();
            return batch;
        }

        public void Reset()
        {
            pending = "";
            finishedKey = null;
            ready.Clear();
            ResetActive();
        }

        // A key change finishes what the previous match already has instead of dropping it.
        void SwitchTo(string key)
        {
            if (matchKey == null)
            {
                matchKey = key;
                return;
            }
            if (matchKey == key) return;
            var batch = Build();
            ResetActive();
            if (batch != null)
            {
                finishedKey = batch.MatchKey;
                ready.Add(batch);
            }
            matchKey = key;
        }

        void ResetActive()
        {
            matchKey = null;
            players.Clear();
            expected = 0;
            summary = false;
            endSeen = false;
            doneSeen = false;
            bufferedBytes = 0;
        }

        void Handle(string line)
        {
            if (line.Length == 0) return;
            var data = DataLine.Match(line);
            if (data.Success)
            {
                AddData(data);
                return;
            }
            var done = DoneLine.Match(line);
            if (done.Success)
            {
                AddDone(done);
                return;
            }
            if (line.IndexOf("[Game] end game callback", StringComparison.Ordinal) >= 0) endSeen = true;
        }

        void AddData(Match data)
        {
            var key = data.Groups[1].Value;
            if (key.Length == 0 || key.Length > MaxMatchKeyChars) return;
            long steamId;
            int seq, total;
            if (!long.TryParse(data.Groups[2].Value, NumberStyles.None, CultureInfo.InvariantCulture, out steamId) || steamId <= 0) return;
            if (!int.TryParse(data.Groups[3].Value, NumberStyles.None, CultureInfo.InvariantCulture, out seq)) return;
            if (!int.TryParse(data.Groups[4].Value, NumberStyles.None, CultureInfo.InvariantCulture, out total)) return;
            if (total < 1 || total > MaxSegments || seq < 1 || seq > total) return;
            if (key == finishedKey) return;
            SwitchTo(key);

            var payload = data.Groups[5].Value;
            PlayerParts state;
            if (!players.TryGetValue(steamId, out state))
            {
                if (players.Count >= MaxPlayers) return;
                state = new PlayerParts { SteamId = steamId, Total = total };
                players.Add(steamId, state);
            }
            if (state.Total != total || state.Segments.ContainsKey(seq)) return;
            if (bufferedBytes + payload.Length > MaxBufferedBytes) return;
            state.Segments.Add(seq, payload);
            bufferedBytes += payload.Length;
        }

        void AddDone(Match done)
        {
            var key = done.Groups[1].Value;
            if (key == finishedKey) return;
            int count;
            if (!int.TryParse(done.Groups[2].Value, NumberStyles.None, CultureInfo.InvariantCulture, out count)) return;
            if (count < 0 || count > MaxPlayers) return;
            // The summary can be the first valid line when the player lines before it are damaged.
            if (matchKey == null) matchKey = key;
            else if (key != matchKey) SwitchTo(key);
            expected = count;
            summary = true;
            doneSeen = true;
        }

        SettlementPart Decode(string payload, long steamId)
        {
            if (payload.Length == 0) return null;
            byte[] bytes;
            try
            {
                var text = payload.Replace('-', '+').Replace('_', '/');
                switch (text.Length % 4)
                {
                    case 2: text += "=="; break;
                    case 3: text += "="; break;
                    case 1: return null;
                }
                bytes = Convert.FromBase64String(text);
            }
            catch (Exception)
            {
                return null;
            }
            if (bytes.Length == 0 || bytes.Length > MaxBodyBytes) return null;
            Dictionary<string, object> body;
            try
            {
                body = serializer.DeserializeObject(Encoding.UTF8.GetString(bytes)) as Dictionary<string, object>;
            }
            catch (Exception)
            {
                return null;
            }
            if (body == null) return null;
            object value;
            var list = body.TryGetValue("players", out value) ? value as object[] : null;
            if (list == null || list.Length != 1) return null;
            var player = list[0] as Dictionary<string, object>;
            if (player == null || !player.TryGetValue("steamId", out value) || value == null) return null;
            long id;
            try
            {
                id = Convert.ToInt64(value, CultureInfo.InvariantCulture);
            }
            catch (Exception)
            {
                return null;
            }
            if (id != steamId) return null;
            return new SettlementPart { SteamId = steamId, Body = body, Player = player };
        }

        SettlementBatch Build()
        {
            if (matchKey == null || players.Count == 0) return null;
            var parts = new List<SettlementPart>();
            foreach (var state in players.Values)
            {
                if (!state.Complete) continue;
                var payload = new StringBuilder();
                for (var seq = 1; seq <= state.Total; seq++) payload.Append(state.Segments[seq]);
                var part = Decode(payload.ToString(), state.SteamId);
                if (part != null) parts.Add(part);
            }
            if (parts.Count == 0) return null;
            parts.Sort((left, right) => left.SteamId.CompareTo(right.SteamId));
            return new SettlementBatch
            {
                MatchKey = matchKey,
                Expected = expected,
                HasSummary = summary,
                Parts = parts
            };
        }

        internal static Dictionary<string, object> Merge(SettlementBatch batch, ICollection<long> keep)
        {
            if (batch == null || batch.Parts.Count == 0) return null;
            var wanted = new HashSet<long>();
            if (keep != null)
            {
                foreach (var id in keep) wanted.Add(id);
            }
            Dictionary<string, object> first = null;
            var mergedPlayers = new List<object>();
            foreach (var part in batch.Parts)
            {
                if (keep != null && !wanted.Contains(part.SteamId)) continue;
                if (first == null) first = part.Body;
                mergedPlayers.Add(part.Player);
            }
            if (first == null) return null;
            var body = new Dictionary<string, object>(first);
            body["players"] = mergedPlayers.ToArray();
            object value;
            if (!body.TryGetValue("perf", out value) || value == null)
            {
                // The whole-match perf block only rides on one of the per-player payloads, which need not be the one kept.
                foreach (var part in batch.Parts)
                {
                    if (part.Body.TryGetValue("perf", out value) && value != null)
                    {
                        body["perf"] = value;
                        break;
                    }
                }
            }
            return body;
        }
    }

    // Reads only bytes appended since the previous call. The offset advances by the bytes actually read, so appends
    // that arrive while a read is in progress are not skipped; the decoder keeps a cut-off UTF-8 sequence for next time.
    sealed class SettlementTail
    {
        readonly int bufferSize;
        long offset;
        Decoder decoder = Encoding.UTF8.GetDecoder();

        public SettlementTail() : this(8192) { }

        internal SettlementTail(int bufferSize)
        {
            this.bufferSize = bufferSize < 4 ? 4 : bufferSize;
        }

        public long Offset { get { return offset; } }

        public void Reset()
        {
            offset = 0;
            decoder = Encoding.UTF8.GetDecoder();
        }

        public string Read(string path)
        {
            if (!File.Exists(path)) return "";
            using (var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
            {
                if (stream.Length < offset) Reset();
                stream.Seek(offset, SeekOrigin.Begin);
                var text = new StringBuilder();
                var buffer = new byte[bufferSize];
                while (true)
                {
                    var read = stream.Read(buffer, 0, buffer.Length);
                    if (read <= 0) break;
                    offset += read;
                    var chars = new char[Encoding.UTF8.GetMaxCharCount(read)];
                    var count = decoder.GetChars(buffer, 0, read, chars, 0, false);
                    text.Append(chars, 0, count);
                }
                return text.ToString();
            }
        }
    }

    sealed class SettlementReply
    {
        public bool Answered;
        public int Status;
        public int RetryAfterMs;
    }

    interface ISettlementTransport
    {
        SettlementReply Post(string url, string json, string apiKey, int timeoutMs, CancellationToken cancel);
    }

    static class SettlementApi
    {
        public const string Path = "game/end/local";
        public static string Direct { get { return LauncherApi.Api + Path; } }
        public static string Relay { get { return LauncherApi.RelayApi + Path; } }
        public static readonly ISettlementTransport Transport = new HttpTransport();

        sealed class HttpTransport : ISettlementTransport
        {
            static HttpTransport()
            {
                ServicePointManager.SecurityProtocol |= (SecurityProtocolType)3072;
            }

            public SettlementReply Post(string url, string json, string apiKey, int timeoutMs, CancellationToken cancel)
            {
                var reply = new SettlementReply();
                CancellationTokenRegistration registration = default(CancellationTokenRegistration);
                try
                {
                    var request = (HttpWebRequest)WebRequest.Create(url);
                    request.Method = "POST";
                    request.ContentType = "application/json";
                    request.Timeout = Math.Max(1, timeoutMs);
                    request.ReadWriteTimeout = Math.Max(1, timeoutMs);
                    request.Headers["x-api-key"] = apiKey;
                    // A connect or read that outlives the upload's whole budget is aborted from the upload thread.
                    registration = cancel.Register(request.Abort);
                    var bytes = Encoding.UTF8.GetBytes(json);
                    using (var stream = request.GetRequestStream()) stream.Write(bytes, 0, bytes.Length);
                    using (var response = (HttpWebResponse)request.GetResponse())
                    {
                        reply.Answered = true;
                        reply.Status = (int)response.StatusCode;
                    }
                }
                catch (WebException error)
                {
                    var response = error.Response as HttpWebResponse;
                    if (response == null) return reply;
                    using (response)
                    {
                        reply.Answered = true;
                        reply.Status = (int)response.StatusCode;
                        var retry = response.Headers["Retry-After"];
                        int seconds;
                        if (!string.IsNullOrEmpty(retry) && int.TryParse(retry, NumberStyles.None, CultureInfo.InvariantCulture, out seconds) && seconds > 0)
                        {
                            reply.RetryAfterMs = seconds * 1000;
                        }
                        else
                        {
                            DateTime when;
                            if (!string.IsNullOrEmpty(retry) && DateTime.TryParse(retry, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out when))
                            {
                                var wait = (int)(when - DateTime.UtcNow).TotalMilliseconds;
                                if (wait > 0) reply.RetryAfterMs = wait;
                            }
                        }
                    }
                }
                catch (Exception)
                {
                }
                finally
                {
                    registration.Dispose();
                }
                return reply;
            }
        }
    }

    // Uploads the complete players of one finished match in a single request. The whole upload ends at its deadline
    // even when a request is still waiting, and only an explicit 4xx answer is reported as a failed upload.
    sealed class SettlementUploader
    {
        const int MaxRequests = 3;
        const int DefaultDeadlineMs = 30000;
        const int RequestTimeoutMs = 8000;
        static readonly int[] RetryMs = { 1000, 3000 };

        readonly Func<string> apiKey;
        readonly ISettlementTransport transport;
        readonly string dedupPath;
        readonly Action<SettlementState, int, int> changed;
        readonly Action<string> diagnostics;
        readonly Func<long> elapsed;
        readonly Action<int> sleep;
        readonly int deadlineMs;
        readonly SettlementLog log = new SettlementLog();
        readonly object sync = new object();
        readonly HashSet<string> sent = new HashSet<string>();
        int round = -1;
        SettlementState state;
        string uploading;
        bool dedupLoaded;
        bool keyWarned;

        public SettlementUploader(Func<string> apiKey, ISettlementTransport transport, string dedupPath, Action<SettlementState, int, int> changed, Action<string> diagnostics)
            : this(apiKey, transport, dedupPath, changed, diagnostics, NowMs, Thread.Sleep, DefaultDeadlineMs) { }

        internal SettlementUploader(Func<string> apiKey, ISettlementTransport transport, string dedupPath, Action<SettlementState, int, int> changed, Action<string> diagnostics, Func<long> elapsed, Action<int> sleep, int deadlineMs = DefaultDeadlineMs)
        {
            this.apiKey = apiKey;
            this.transport = transport;
            this.dedupPath = dedupPath;
            this.changed = changed;
            this.diagnostics = diagnostics;
            this.elapsed = elapsed;
            this.sleep = sleep;
            this.deadlineMs = deadlineMs;
        }

        public SettlementState State { get { lock (sync) return state; } }
        public int Game { get { lock (sync) return round; } }

        public void Reset(int round)
        {
            lock (sync) this.round = round;
            log.Reset();
            SetState(SettlementState.None, round, 0);
        }

        // The room's game number is captured with the batch, so an answer that arrives after the next game cannot label itself.
        public void Observe(string text, int round, int roomGame)
        {
            if (this.round != round)
            {
                lock (sync) this.round = round;
                log.Reset();
                SetState(SettlementState.None, round, roomGame);
            }
            if (string.IsNullOrEmpty(text)) return;
            SettlementBatch batch;
            try
            {
                batch = log.Feed(text);
            }
            catch (Exception)
            {
                return;
            }
            while (batch != null)
            {
                Start(batch, round, roomGame);
                try
                {
                    batch = log.Feed("");
                }
                catch (Exception)
                {
                    return;
                }
            }
        }

        // The last read of a round: sends complete players even when the summary line itself was cut off.
        public void ObserveFinal(string text, int round, int roomGame)
        {
            Observe(text, round, roomGame);
            SettlementBatch batch;
            try
            {
                batch = log.Finish();
            }
            catch (Exception)
            {
                return;
            }
            if (batch != null) Start(batch, round, roomGame);
        }

        // Waits for the current request to finish or time out, never longer than the given budget.
        public void WaitIdle(int timeoutMs)
        {
            var until = NowMs() + (timeoutMs < 0 ? 0 : timeoutMs);
            while (true)
            {
                lock (sync)
                {
                    if (uploading == null && state != SettlementState.Sending) return;
                }
                if (NowMs() >= until) return;
                Thread.Sleep(50);
            }
        }

        void Start(SettlementBatch batch, int forRound, int roomGame)
        {
            if (batch.Parts.Count == 0) return;
            var key = (apiKey() ?? "").Trim();
            if (key.Length == 0)
            {
                WarnMissingKey(forRound, roomGame);
                return;
            }
            var remaining = new List<long>();
            var already = 0;
            lock (sync)
            {
                if (uploading == batch.MatchKey) return;
                LoadDedup();
                foreach (var part in batch.Parts)
                {
                    if (sent.Contains(DedupKey(batch.MatchKey, part.SteamId))) already++;
                    else remaining.Add(part.SteamId);
                }
                if (remaining.Count > 0) uploading = batch.MatchKey;
            }
            if (remaining.Count == 0)
            {
                SetState(batch.HasSummary && batch.Expected > 0 && already >= batch.Expected ? SettlementState.SentAll : SettlementState.Partial, forRound, roomGame);
                return;
            }
            var body = SettlementLog.Merge(batch, remaining);
            if (body == null)
            {
                ClearUploading(batch.MatchKey);
                return;
            }
            string json;
            try
            {
                json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue }.Serialize(body);
            }
            catch (Exception)
            {
                ClearUploading(batch.MatchKey);
                return;
            }
            SetState(SettlementState.Sending, forRound, roomGame);
            var deadline = elapsed() + deadlineMs;
            var thread = new Thread(() => Run(batch, remaining, already, json, key, forRound, roomGame, deadline));
            thread.IsBackground = true;
            thread.Start();
        }

        void Run(SettlementBatch batch, List<long> ids, int already, string json, string key, int forRound, int roomGame, long deadline)
        {
            // The request runs on its own thread so the caller can end the whole upload at the deadline even if
            // connect or read is still blocked. Only this thread reports the result, so a late answer stays ignored.
            var cancel = new CancellationTokenSource();
            var finished = new ManualResetEvent(false);
            var result = SettlementState.None;
            var work = new Thread(() =>
            {
                try
                {
                    result = Attempt(batch, ids, already, json, key, deadline, cancel.Token);
                }
                catch (Exception)
                {
                    result = SettlementState.None;
                }
                finally
                {
                    finished.Set();
                }
            })
            { IsBackground = true };
            work.Start();
            var left = deadline - elapsed();
            var answered = left > 0 && finished.WaitOne((int)Math.Min(left, int.MaxValue));
            if (!answered || elapsed() > deadline)
            {
                cancel.Cancel();
                result = SettlementState.None;
            }
            if (answered) finished.Close();
            // Report before releasing the match, so a following batch cannot have its Sending overwritten by this result.
            SetState(result, forRound, roomGame);
            ClearUploading(batch.MatchKey);
        }

        SettlementState Attempt(SettlementBatch batch, List<long> ids, int already, string json, string key, long deadline, CancellationToken cancel)
        {
            var confirmed = already;
            var route = SettlementApi.Direct;
            var attempts = 0;
            var delay = 0;
            while (attempts < MaxRequests)
            {
                if (cancel.IsCancellationRequested) return SettlementState.None;
                if (attempts > 0)
                {
                    var wait = delay > 0 ? delay : RetryMs[Math.Min(attempts - 1, RetryMs.Length - 1)];
                    delay = 0;
                    if (!WaitUntil(deadline, wait)) return SettlementState.None;
                }
                var left = deadline - elapsed();
                if (left <= 0) return SettlementState.None;
                attempts++;
                var reply = transport.Post(route, json, key, (int)Math.Min(RequestTimeoutMs, left), cancel);
                if (cancel.IsCancellationRequested) return SettlementState.None;
                if (reply != null && reply.Answered && reply.Status >= 200 && reply.Status < 300)
                {
                    // An answer that arrives after the budget has run out cannot turn the result green.
                    if (elapsed() > deadline) return SettlementState.None;
                    foreach (var id in ids) MarkSent(batch.MatchKey, id);
                    confirmed += ids.Count;
                    return batch.HasSummary && batch.Expected > 0 && confirmed >= batch.Expected
                        ? SettlementState.SentAll
                        : SettlementState.Partial;
                }
                if (reply != null && reply.Answered)
                {
                    if (reply.Status == 429 || reply.Status >= 500)
                    {
                        delay = reply.RetryAfterMs;
                        continue;
                    }
                    if (reply.Status >= 400 && reply.Status < 500) return SettlementState.Failed;
                    return SettlementState.None;
                }
                // A direct request with no HTTP answer at all is the only case that switches to the relay.
                if (route == SettlementApi.Direct) route = SettlementApi.Relay;
            }
            return SettlementState.None;
        }

        bool WaitUntil(long deadline, int milliseconds)
        {
            if (milliseconds <= 0) return elapsed() < deadline;
            var left = deadline - elapsed();
            if (left <= 0) return false;
            if (milliseconds >= left)
            {
                sleep((int)Math.Min(left, int.MaxValue));
                return false;
            }
            sleep(milliseconds);
            return elapsed() < deadline;
        }

        void SetState(SettlementState next, int forRound, int roomGame)
        {
            Action<SettlementState, int, int> handler;
            lock (sync)
            {
                if (forRound != round) return;
                if (state == next) return;
                state = next;
                handler = changed;
            }
            if (handler != null) handler(next, forRound, roomGame);
        }

        void ClearUploading(string matchKey)
        {
            lock (sync)
            {
                if (uploading == matchKey) uploading = null;
            }
        }

        void WarnMissingKey(int forRound, int roomGame)
        {
            var first = false;
            lock (sync)
            {
                if (!keyWarned)
                {
                    keyWarned = true;
                    first = true;
                }
            }
            if (first && diagnostics != null) diagnostics("settlement upload skipped: LAUNCHER_APIKEY is not set");
            SetState(SettlementState.None, forRound, roomGame);
        }

        void LoadDedup()
        {
            if (dedupLoaded) return;
            dedupLoaded = true;
            if (string.IsNullOrEmpty(dedupPath)) return;
            try
            {
                if (!File.Exists(dedupPath)) return;
                foreach (var line in File.ReadAllLines(dedupPath))
                {
                    if (line.Length > 0) sent.Add(line);
                }
            }
            catch (Exception)
            {
            }
        }

        static long NowMs()
        {
            return Stopwatch.GetTimestamp() * 1000 / Stopwatch.Frequency;
        }

        void MarkSent(string matchKey, long steamId)
        {
            var line = DedupKey(matchKey, steamId);
            lock (sync)
            {
                if (!sent.Add(line)) return;
            }
            try
            {
                if (string.IsNullOrEmpty(dedupPath)) return;
                var folder = Path.GetDirectoryName(dedupPath);
                if (!string.IsNullOrEmpty(folder)) Directory.CreateDirectory(folder);
                File.AppendAllText(dedupPath, line + Environment.NewLine);
            }
            catch (Exception)
            {
                // Losing the dedup file only costs a repeated upload; the backend keeps its own cooldown.
            }
        }

        static string DedupKey(string matchKey, long steamId)
        {
            return matchKey + "\t" + steamId.ToString(CultureInfo.InvariantCulture);
        }
    }
}
