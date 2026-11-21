using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

namespace Windy10v10AI.Launcher.Tests
{
    static class SettlementTests
    {
        public static void RunAll()
        {
            SameBatchKeepsPlayersAfterTheEndMarker();
            MissingPlayerStillSendsTheRest();
            MissingPlayerUploadsTheRestInOneRequest();
            MergeKeepsPlayersAndPerf();
            UnknownVersionDuplicatesOutOfOrderAndHalfLines();
            ChunkedPayloadIsJoinedBeforeDecoding();
            BadBodyAndMismatchedPlayerAreIgnored();
            TailAdvancesByBytesActuallyRead();
            NoSummaryIsNotAGreenSuccess();
            RetriesAndSwitchesOnlyAfterNoAnswer();
            RetryAfterKeepsTheSameRoute();
            ServerErrorsRetryTheSameRoute();
            ExplicitBadRequestStopsAtOnce();
            DeadlineStopsTheUpload();
            SuccessIsDeduplicatedLocally();
            MissingKeySkipsQuietly();
            LateReplyCannotChangeTheNextRound();
            StartsWithOneSettlementState();
            Console.WriteLine("PASS settlement parser, upload and tunnel state tests");
        }

        static void SameBatchKeepsPlayersAfterTheEndMarker()
        {
            var log = new SettlementLog();
            var text = Line("room-1", 11, 1, 1, Body(11, false)) +
                Line("room-1", 22, 1, 1, Body(22, false)) +
                "[Game] end game callback data OK\n" +
                Line("room-1", 33, 1, 1, Body(33, false));
            var batch = log.Feed(text);
            Check(batch != null && batch.Parts.Count == 3, "the last player after the end marker belongs to the same batch");
            Check(batch.MatchKey == "room-1" && !batch.HasSummary, "a legacy end marker still ends the batch");
            Check(log.Feed(Line("room-1", 44, 1, 1, Body(44, false))) == null, "late lines after the marker do not start another upload");
        }

        static void MissingPlayerStillSendsTheRest()
        {
            var log = new SettlementLog();
            var text = "";
            for (var id = 1; id <= 10; id++)
            {
                if (id == 7) continue;
                text += Line("room-2", id, 1, 1, Body(id, false));
            }
            text += "[WSettle] done v1 room-2 10\n";
            var batch = log.Feed(text);
            Check(batch != null && batch.HasSummary && batch.Expected == 10, "the summary keeps the expected player count");
            Check(batch.Parts.Count == 9, "a missing player does not hold back the other nine");
        }

        static void MissingPlayerUploadsTheRestInOneRequest()
        {
            var text = "";
            for (var id = 1; id <= 10; id++)
            {
                if (id == 7) continue;
                text += Line("room-16", id, 1, 1, Body(id, false));
            }
            text += "[WSettle] done v1 room-16 10\n";
            var transport = new FakeTransport();
            transport.Replies.Add(() => Reply(200));
            var uploader = NewUploader(transport, "key");
            uploader.Observe(text, 1);
            WaitFor(uploader, SettlementState.Partial);
            Check(transport.Urls.Count == 1, "the remaining players go out in one request");
            var body = Deserialize(transport.Bodies[0]);
            Check(((object[])body["players"]).Length == 9, "the request contains the nine complete players");
            Check(uploader.State != SettlementState.SentAll, "a missing expected player keeps the all-sent light off");
        }

        static void MergeKeepsPlayersAndPerf()
        {
            var log = new SettlementLog();
            var batch = log.Feed(Line("room-3", 11, 1, 1, Body(11, true)) + Line("room-3", 22, 1, 1, Body(22, false)) + "[WSettle] done v1 room-3 2\n");
            var body = SettlementLog.Merge(batch, null);
            var players = (object[])body["players"];
            Check(players.Length == 2, "one request carries every complete player");
            Check(body.ContainsKey("perf") && ((Dictionary<string, object>)body["perf"])["host"].Equals("launcher"), "the whole-match perf block is kept");
            Check((int)body["winnerTeamId"] == 2 && (int)body["matchId"] == 123, "shared fields come from the first payload");
            Check(((Dictionary<string, object>)players[0])["kills"].Equals(3), "player data is copied unchanged");
            var onlySecond = SettlementLog.Merge(batch, new long[] { 22 });
            Check(((object[])onlySecond["players"]).Length == 1 && onlySecond.ContainsKey("perf"), "perf survives even when its payload is already deduplicated");
        }

        static void UnknownVersionDuplicatesOutOfOrderAndHalfLines()
        {
            var log = new SettlementLog();
            var encoded = Payload(Body(11, false));
            var splitAt = encoded.Length / 2;
            var first = RawLine("room-4", 11, 1, 2, encoded.Substring(0, splitAt));
            var second = RawLine("room-4", 11, 2, 2, encoded.Substring(splitAt));
            var split = first.Length / 2;
            Check(log.Feed("[WSettle] v2 room-4 11 1/1 " + Payload(Body(11, false)) + "\n") == null, "an unknown protocol is ignored");
            Check(log.Feed("noise " + first.Substring(0, split)) == null, "a half line waits for the rest");
            log.Feed(first.Substring(split) + second + first);
            var batch = log.Feed("[Game] end game callback\n");
            Check(batch != null && batch.Parts.Count == 1, "out-of-order segments complete a player and a duplicate does not add another");
        }

        static void ChunkedPayloadIsJoinedBeforeDecoding()
        {
            var body = Body(11, true);
            var encoded = Payload(body);
            var total = (encoded.Length + 4) / 5;
            var text = "";
            for (var seq = 1; seq <= total; seq++)
            {
                var start = (seq - 1) * 5;
                var length = Math.Min(5, encoded.Length - start);
                text += RawLine("room-14", 11, seq, total, encoded.Substring(start, length));
            }
            var log = new SettlementLog();
            log.Feed(text.Substring(0, text.Length / 2));
            var batch = log.Feed(text.Substring(text.Length / 2) + "[WSettle] done v1 room-14 1\n");
            Check(batch != null && batch.Parts.Count == 1, "a payload split into several chunks is joined for one player");
            var merged = SettlementLog.Merge(batch, null);
            Check(((object[])merged["players"]).Length == 1 && merged.ContainsKey("perf"), "the joined payload decodes to the original request");
        }

        static void BadBodyAndMismatchedPlayerAreIgnored()
        {
            var log = new SettlementLog();
            var text = RawLine("room-15", 11, 1, 1, "not-base64") +
                Line("room-15", 12, 1, 1, Body(99, false)) +
                Line("room-15", 22, 1, 1, Body(22, false)) +
                "[Game] end game callback\n";
            var batch = log.Feed(text);
            Check(batch != null && batch.Parts.Count == 1 && batch.Parts[0].SteamId == 22, "a bad body and a player mismatch leave only the valid player");
        }

        static void TailAdvancesByBytesActuallyRead()
        {
            var path = Path.Combine(Path.GetTempPath(), "settlement-tail-" + Guid.NewGuid().ToString("N") + ".log");
            try
            {
                var bytes = Encoding.UTF8.GetBytes("你好\n");
                using (var stream = new FileStream(path, FileMode.Create, FileAccess.Write, FileShare.ReadWrite))
                {
                    stream.Write(bytes, 0, 1);
                }
                var tail = new SettlementTail(4);
                var text = tail.Read(path);
                Check(text == "" && tail.Offset == 1, "a cut-off UTF-8 sequence is kept, not lost");
                using (var stream = new FileStream(path, FileMode.Append, FileAccess.Write, FileShare.ReadWrite))
                {
                    stream.Write(bytes, 1, bytes.Length - 1);
                }
                Check(tail.Read(path) == "你好\n", "the rest of the character arrives on the next read");
                File.AppendAllText(path, "next\n");
                Check(tail.Read(path) == "next\n" && tail.Offset == new FileInfo(path).Length, "the offset follows bytes actually read");
                File.WriteAllText(path, "fresh\n");
                Check(tail.Read(path) == "fresh\n", "a shorter file starts again from zero");
            }
            finally
            {
                File.Delete(path);
            }
        }

        static void NoSummaryIsNotAGreenSuccess()
        {
            var transport = new FakeTransport();
            transport.Replies.Add(() => Reply(200));
            var uploader = NewUploader(transport, "key");
            uploader.Observe(Line("room-5", 11, 1, 1, Body(11, false)) + Line("room-5", 22, 1, 1, Body(22, false)) + "[Game] end game callback\n", 1);
            WaitFor(uploader, SettlementState.Partial);
            Check(transport.Urls.Count == 1, "one merged request is enough");
            Check(((object[])((Dictionary<string, object>)Deserialize(transport.Bodies[0]))["players"]).Length == 2, "the request body carries both players");
            Check(uploader.State != SettlementState.SentAll, "an old game without a summary never shows the all-sent light");
        }

        static void RetriesAndSwitchesOnlyAfterNoAnswer()
        {
            var transport = new FakeTransport();
            transport.Replies.Add(() => Reply(0, false));
            transport.Replies.Add(() => Reply(200));
            var delays = new List<int>();
            var uploader = NewUploader(transport, "key", delays);
            uploader.Observe(Complete("room-6", 2), 1);
            WaitFor(uploader, SettlementState.SentAll);
            Check(transport.Urls.Count == 2, "a direct request with no answer is retried once on the relay");
            Check(transport.Urls[0] == SettlementApi.Direct && transport.Urls[1] == SettlementApi.Relay, "the retry switches to the Guangzhou relay");
            Check(delays.Count == 1 && delays[0] == 1000, "the second request waits one second");
        }

        static void RetryAfterKeepsTheSameRoute()
        {
            var transport = new FakeTransport();
            transport.Replies.Add(() => Reply(429, true, 2000));
            transport.Replies.Add(() => Reply(200));
            var delays = new List<int>();
            var uploader = NewUploader(transport, "key", delays);
            uploader.Observe(Complete("room-7", 2), 1);
            WaitFor(uploader, SettlementState.SentAll);
            Check(transport.Urls.Count == 2 && transport.Urls[0] == SettlementApi.Direct && transport.Urls[1] == SettlementApi.Direct, "a 429 retries on the current route");
            Check(delays.Count == 1 && delays[0] == 2000, "Retry-After is obeyed inside the budget");
        }

        static void ServerErrorsRetryTheSameRoute()
        {
            var transport = new FakeTransport();
            transport.Replies.Add(() => Reply(500));
            transport.Replies.Add(() => Reply(500));
            transport.Replies.Add(() => Reply(200));
            var delays = new List<int>();
            var uploader = NewUploader(transport, "key", delays);
            uploader.Observe(Complete("room-13", 2), 1);
            WaitFor(uploader, SettlementState.SentAll);
            Check(transport.Urls.Count == 3 && transport.Urls.TrueForAll(url => url == SettlementApi.Direct), "5xx answers stay on the direct route");
            Check(delays.Count == 2 && delays[0] == 1000 && delays[1] == 3000, "the three attempts are spaced one and three seconds apart");
        }

        static void ExplicitBadRequestStopsAtOnce()
        {
            var transport = new FakeTransport();
            transport.Replies.Add(() => Reply(400));
            var uploader = NewUploader(transport, "key");
            uploader.Observe(Complete("room-8", 2), 1);
            WaitFor(uploader, SettlementState.Failed);
            Check(transport.Urls.Count == 1, "an explicit 4xx is not retried");
        }

        static void DeadlineStopsTheUpload()
        {
            var clock = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
            var transport = new FakeTransport();
            transport.BeforeReply = () => clock = clock.AddSeconds(20);
            transport.Replies.Add(() => Reply(0, false));
            transport.Replies.Add(() => Reply(0, false));
            transport.Replies.Add(() => Reply(0, false));
            var delays = new List<int>();
            var uploader = NewUploader(transport, "key", delays, () => clock, ms => clock = clock.AddMilliseconds(ms));
            uploader.Observe(Complete("room-9", 2), 1);
            WaitFor(uploader, SettlementState.None);
            Check(transport.Urls.Count == 2, "the 30-second budget stops a third request");
        }

        static void SuccessIsDeduplicatedLocally()
        {
            var transport = new FakeTransport();
            transport.Replies.Add(() => Reply(200));
            var path = Path.Combine(Path.GetTempPath(), "settlement-sent-" + Guid.NewGuid().ToString("N") + ".txt");
            try
            {
                var first = NewUploader(transport, "key", null, null, null, path);
                first.Observe(Complete("room-10", 2), 1);
                WaitFor(first, SettlementState.SentAll);
                Check(transport.Urls.Count == 1, "a successful upload records its players");
                var second = NewUploader(transport, "key", null, null, null, path);
                second.Observe(Complete("room-10", 2), 1);
                WaitFor(second, SettlementState.SentAll);
                Check(transport.Urls.Count == 1, "the same match and players are not sent again after a restart");
            }
            finally
            {
                File.Delete(path);
            }
        }

        static void MissingKeySkipsQuietly()
        {
            var transport = new FakeTransport();
            var notes = new List<string>();
            var uploader = new SettlementUploader(() => "", transport, null, (state, game) => { }, notes.Add);
            uploader.Observe(Complete("room-11", 2), 1);
            Check(uploader.State == SettlementState.None && transport.Urls.Count == 0, "an empty key skips the upload without an error");
            Check(notes.Count == 1 && notes[0].IndexOf("LAUNCHER_APIKEY", StringComparison.Ordinal) >= 0, "one non-sensitive diagnostic explains the skip");
            uploader.Observe(Complete("room-11", 2), 1);
            Check(notes.Count == 1, "the missing-key note is written once");
        }

        static void LateReplyCannotChangeTheNextRound()
        {
            var transport = new FakeTransport { Block = true };
            transport.Replies.Add(() => Reply(200));
            var uploader = NewUploader(transport, "key");
            uploader.Observe(Complete("room-12", 2), 1);
            Check(transport.Entered.WaitOne(3000), "the first round reaches the transport");
            uploader.Reset(2);
            transport.Release.Set();
            transport.Finished.WaitOne(3000);
            Thread.Sleep(50);
            Check(uploader.State == SettlementState.None, "a late answer from the previous round does not change the current one");
        }

        static void StartsWithOneSettlementState()
        {
            var tunnel = new JoinTunnel();
            try
            {
                tunnel.Game = 2;
                Check(!tunnel.ApplySettlement(HostTunnel.EncodeSettlement(1, 2)), "a packet for the finished game is stale");
                Check(tunnel.ApplySettlement(HostTunnel.EncodeSettlement(2, 2)) && tunnel.Settlement == 2, "the host's current settlement state reaches a joiner");
                Check(!tunnel.ApplySettlement(HostTunnel.EncodeSettlement(3, 3)), "a packet for a game the joiner has not entered yet is ignored");
            }
            finally
            {
                tunnel.Dispose();
            }
        }

        static SettlementUploader NewUploader(FakeTransport transport, string key, List<int> delays = null, Func<DateTime> now = null, Action<int> sleep = null, string dedupPath = null)
        {
            if (dedupPath == null) dedupPath = Path.Combine(Path.GetTempPath(), "settlement-sent-" + Guid.NewGuid().ToString("N") + ".txt");
            if (delays == null) delays = new List<int>();
            if (sleep == null) sleep = ms => { delays.Add(ms); Thread.Sleep(0); };
            return new SettlementUploader(() => key, transport, dedupPath, (state, game) => { }, null, now ?? (() => DateTime.UtcNow), sleep);
        }

        static string Complete(string matchKey, int players)
        {
            var text = "";
            for (var id = 1; id <= players; id++) text += Line(matchKey, id, 1, 1, Body(id, id == 1));
            return text + "[WSettle] done v1 " + matchKey + " " + players + "\n";
        }

        static Dictionary<string, object> Body(int steamId, bool perf)
        {
            var player = new Dictionary<string, object>
            {
                { "steamId", steamId },
                { "heroName", "npc_dota_hero_abaddon" },
                { "teamId", 2 },
                { "isDisconnected", false },
                { "level", 30 },
                { "totalGoldEarned", 1000 },
                { "kills", 3 },
                { "deaths", 1 },
                { "assists", 4 },
                { "score", 10 },
                { "battlePoints", 12 },
                { "lastHits", 100 },
                { "heroDamage", 2000 },
                { "damageTaken", 3000 },
                { "healing", 0 },
                { "towerKills", 1 }
            };
            var body = new Dictionary<string, object>
            {
                { "matchId", 123 },
                { "version", "test" },
                { "winnerTeamId", 2 },
                { "playerCount", 2 },
                { "players", new object[] { player } }
            };
            if (perf)
            {
                body["perf"] = new Dictionary<string, object>
                {
                    { "host", "launcher" },
                    { "realSec", 1800 },
                    { "units", 10 },
                    { "modifiers", 2 },
                    { "segments", new object[0] }
                };
            }
            return body;
        }

        static string Line(string matchKey, long steamId, int seq, int total, Dictionary<string, object> body)
        {
            return RawLine(matchKey, steamId, seq, total, Payload(body));
        }

        static string RawLine(string matchKey, long steamId, int seq, int total, string payload)
        {
            return "[VScript] [WSettle] v1 " + matchKey + " " + steamId + " " + seq + "/" + total + " " + payload + "\n";
        }

        static string Payload(Dictionary<string, object> body)
        {
            var json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue }.Serialize(body);
            return Convert.ToBase64String(Encoding.UTF8.GetBytes(json)).Replace('+', '-').Replace('/', '_').TrimEnd('=');
        }

        static Dictionary<string, object> Deserialize(string json)
        {
            return (Dictionary<string, object>)new JavaScriptSerializer { MaxJsonLength = int.MaxValue }.DeserializeObject(json);
        }

        static SettlementReply Reply(int status, bool answered = true, int retryAfterMs = 0)
        {
            return new SettlementReply { Answered = answered, Status = status, RetryAfterMs = retryAfterMs };
        }

        static void WaitFor(SettlementUploader uploader, SettlementState state)
        {
            for (var i = 0; i < 300; i++)
            {
                if (uploader.State == state) return;
                Thread.Sleep(10);
            }
            throw new Exception("settlement state stayed " + uploader.State + " instead of " + state);
        }

        static void Check(bool condition, string message)
        {
            if (!condition) throw new Exception(message);
        }

        sealed class FakeTransport : ISettlementTransport
        {
            readonly object sync = new object();
            public readonly List<string> Urls = new List<string>();
            public readonly List<string> Bodies = new List<string>();
            public readonly List<Func<SettlementReply>> Replies = new List<Func<SettlementReply>>();
            public readonly ManualResetEvent Entered = new ManualResetEvent(false);
            public readonly ManualResetEvent Release = new ManualResetEvent(false);
            public readonly ManualResetEvent Finished = new ManualResetEvent(false);
            public bool Block;
            public Action BeforeReply;
            int index;

            public SettlementReply Post(string url, string json, string apiKey, int timeoutMs)
            {
                lock (sync)
                {
                    Urls.Add(url);
                    Bodies.Add(json);
                }
                Entered.Set();
                if (Block) Release.WaitOne(5000);
                if (BeforeReply != null) BeforeReply();
                Func<SettlementReply> reply;
                lock (sync)
                {
                    reply = index < Replies.Count ? Replies[index++] : null;
                }
                try
                {
                    return reply != null ? reply() : new SettlementReply { Answered = true, Status = 200 };
                }
                finally
                {
                    Finished.Set();
                }
            }
        }
    }
}
