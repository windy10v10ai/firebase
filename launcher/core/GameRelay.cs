using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;

namespace Windy10v10AI.Launcher
{
    sealed class RelayRequest
    {
        public int Id;
        public int TimeoutSeconds;
        public string Path;
    }

    sealed class RelayReply
    {
        public bool Answered;
        public int Status;
        public string Body = "";
    }

    interface IRelayTransport
    {
        RelayReply Get(string url, string apiKey, int timeoutMs);
    }

    // The dedicated server cannot send HTTP, so it asks for read-only API calls with a log line and picks the
    // answers up from a KV file inside the addon folder. Line and file formats are mirrored by the map's
    // launcher-relay.ts in the game repository; change both together.
    sealed class GameRelay
    {
        const string RequestPrefix = "[WReq] v1 ";
        const int MaxTimeoutSeconds = 20;
        const int DirectAttemptSeconds = 6;
        static readonly Regex[] Allowed =
        {
            new Regex(@"^/game/start\?[A-Za-z0-9=&,._-]*$"),
            new Regex(@"^/player/[0-9]+/info(\?[A-Za-z0-9=&,._-]*)?$"),
            new Regex(@"^/daily-task/[0-9]+$"),
        };

        readonly Func<string> apiKey;
        readonly IRelayTransport transport;
        string file;
        readonly Action<string> diagnostics;
        readonly object sync = new object();
        readonly SortedDictionary<int, RelayReply> answers = new SortedDictionary<int, RelayReply>();
        readonly HashSet<int> seen = new HashSet<int>();
        string pending = "";
        int generation;

        public GameRelay(Func<string> apiKey, IRelayTransport transport, Action<string> diagnostics)
        {
            this.apiKey = apiKey;
            this.transport = transport;
            this.diagnostics = diagnostics;
        }

        // Called before the server starts; the marker tells the map that a launcher is on the other end
        public void Start(string file)
        {
            lock (sync)
            {
                this.file = file;
                generation++;
                answers.Clear();
                seen.Clear();
                pending = "";
                Write();
            }
        }

        public void Stop()
        {
            lock (sync)
            {
                generation++;
                try
                {
                    if (file != null && File.Exists(file)) File.Delete(file);
                }
                catch (Exception)
                {
                }
            }
        }

        internal static bool IsAllowed(string path)
        {
            foreach (var pattern in Allowed)
            {
                if (pattern.IsMatch(path)) return true;
            }
            return false;
        }

        internal static List<RelayRequest> Parse(string line)
        {
            var found = new List<RelayRequest>();
            var at = line.IndexOf(RequestPrefix, StringComparison.Ordinal);
            if (at < 0) return found;
            var parts = line.Substring(at + RequestPrefix.Length).Trim().Split(' ');
            int id, timeout;
            if (parts.Length != 3) return found;
            if (!int.TryParse(parts[0], NumberStyles.None, CultureInfo.InvariantCulture, out id)) return found;
            if (!int.TryParse(parts[1], NumberStyles.None, CultureInfo.InvariantCulture, out timeout)) return found;
            found.Add(new RelayRequest { Id = id, TimeoutSeconds = Math.Max(1, Math.Min(timeout, MaxTimeoutSeconds)), Path = parts[2] });
            return found;
        }

        // Takes whatever the log gained since the last read; a half line waits for the next call
        public void Observe(string text)
        {
            if (string.IsNullOrEmpty(text)) return;
            var requests = new List<RelayRequest>();
            int round;
            lock (sync)
            {
                pending += text;
                var end = pending.LastIndexOf('\n');
                if (end < 0) return;
                var lines = pending.Substring(0, end).Split('\n');
                pending = pending.Substring(end + 1);
                foreach (var line in lines) requests.AddRange(Parse(line.TrimEnd('\r')));
                round = generation;
            }
            foreach (var request in requests)
            {
                lock (sync)
                {
                    if (!seen.Add(request.Id)) continue;
                }
                var current = request;
                ThreadPool.QueueUserWorkItem(delegate { Serve(current, round); });
            }
        }

        void Serve(RelayRequest request, int round)
        {
            RelayReply reply;
            if (!IsAllowed(request.Path))
            {
                diagnostics("relay refused " + request.Path);
                reply = new RelayReply { Answered = true, Status = 403 };
            }
            else
            {
                reply = Fetch(request);
            }
            lock (sync)
            {
                if (round != generation) return;
                answers[request.Id] = reply;
                Write();
            }
        }

        RelayReply Fetch(RelayRequest request)
        {
            var key = apiKey();
            if (string.IsNullOrEmpty(key))
            {
                diagnostics("relay skipped, no key");
                return new RelayReply { Answered = true, Status = 401 };
            }
            var relativePath = request.Path.TrimStart('/');
            var started = DateTime.UtcNow;
            var budgetMs = request.TimeoutSeconds * 1000;
            var reply = transport.Get(LauncherApi.Api + relativePath, key, Math.Min(budgetMs, DirectAttemptSeconds * 1000));
            if (!ShouldSwitchRoute(reply)) return reply;

            var left = budgetMs - (int)(DateTime.UtcNow - started).TotalMilliseconds;
            if (left < 1000) return reply;
            diagnostics("relay switches route for " + request.Id + " status " + (reply.Answered ? reply.Status.ToString(CultureInfo.InvariantCulture) : "none"));
            var second = transport.Get(LauncherApi.RelayApi + relativePath, key, left);
            return second.Answered ? second : reply;
        }

        static bool ShouldSwitchRoute(RelayReply reply)
        {
            return !reply.Answered || reply.Status == 429 || reply.Status >= 500;
        }

        internal static string Encode(string text)
        {
            return Convert.ToBase64String(Encoding.UTF8.GetBytes(text)).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        }

        // Caller holds the lock. Replaces the file in one step so the map never reads half of it
        void Write()
        {
            if (file == null) return;
            var text = new StringBuilder();
            text.Append("\"relay\"\n{\n\t\"launcher\"\t\"1\"\n");
            foreach (var pair in answers)
            {
                text.Append("\t\"").Append(pair.Key.ToString(CultureInfo.InvariantCulture)).Append("\"\n\t{\n");
                text.Append("\t\t\"status\"\t\"").Append((pair.Value.Answered ? pair.Value.Status : 0).ToString(CultureInfo.InvariantCulture)).Append("\"\n");
                text.Append("\t\t\"body\"\t\"").Append(Encode(pair.Value.Body ?? "")).Append("\"\n\t}\n");
            }
            text.Append("}\n");
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(file));
                var temp = file + ".tmp";
                File.WriteAllText(temp, text.ToString(), new UTF8Encoding(false));
                for (var attempt = 0; attempt < 10; attempt++)
                {
                    try
                    {
                        if (File.Exists(file)) File.Replace(temp, file, null);
                        else File.Move(temp, file);
                        return;
                    }
                    catch (IOException)
                    {
                        Thread.Sleep(30);
                    }
                }
                diagnostics("relay file busy");
            }
            catch (Exception error)
            {
                diagnostics("relay write failed " + error.GetType().Name);
            }
        }
    }

    sealed class HttpRelayTransport : IRelayTransport
    {
        static HttpRelayTransport()
        {
            ServicePointManager.SecurityProtocol |= (SecurityProtocolType)3072;
        }

        public RelayReply Get(string url, string apiKey, int timeoutMs)
        {
            var reply = new RelayReply();
            try
            {
                var request = (HttpWebRequest)WebRequest.Create(url);
                request.Method = "GET";
                request.Timeout = Math.Max(1, timeoutMs);
                request.ReadWriteTimeout = Math.Max(1, timeoutMs);
                request.Headers["x-api-key"] = apiKey;
                using (var response = (HttpWebResponse)request.GetResponse())
                {
                    Fill(reply, response);
                }
            }
            catch (WebException error)
            {
                var response = error.Response as HttpWebResponse;
                if (response == null) return reply;
                using (response)
                {
                    Fill(reply, response);
                }
            }
            catch (Exception)
            {
            }
            return reply;
        }

        static void Fill(RelayReply reply, HttpWebResponse response)
        {
            reply.Answered = true;
            reply.Status = (int)response.StatusCode;
            using (var reader = new StreamReader(response.GetResponseStream(), Encoding.UTF8))
            {
                reply.Body = reader.ReadToEnd();
            }
        }
    }
}
