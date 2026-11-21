using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
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
            SummaryBeforeTheFirstPlayerLine();
            AKeySwitchKeepsTheFinishedMatch();
            TrailingHalfLineWaitsForTheNextRead();
            FinalReadAfterTheServerStops();
            FinalReadUploadsCompletePlayersWithoutTheSummary();
            BadBodyAndMismatchedPlayerAreIgnored();
            TailAdvancesByBytesActuallyRead();
            NoSummaryIsNotAGreenSuccess();
            RetriesAndSwitchesOnlyAfterNoAnswer();
            RetryAfterKeepsTheSameRoute();
            ServerErrorsRetryTheSameRoute();
            ExplicitBadRequestStopsAtOnce();
            DeadlineStopsTheUpload();
            LateSuccessCannotTurnGreen();
            ABlockedRequestEndsAtTheDeadline();
            SuccessIsDeduplicatedLocally();
            DedupReadsPastTheOldLimit();
            MissingKeySkipsQuietly();
            LateReplyCannotChangeTheNextRound();
            CallbacksCarryTheCapturedRoomGame();
            SettlementStateCrossesTheRealTunnel();
            BuildKeyIsMasked();
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
            uploader.Observe(text, 1, 0);
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

        static void SummaryBeforeTheFirstPlayerLine()
        {
            var log = new SettlementLog();
            Check(log.Feed("[WSettle] done v1 room-17 2\n") == null, "the summary waits when no valid player line came first");
            var batch = log.Feed(Line("room-17", 11, 1, 1, Body(11, false)) + Line("room-17", 22, 1, 1, Body(22, false)));
            Check(batch != null && batch.MatchKey == "room-17" && batch.HasSummary && batch.Expected == 2, "a later player line binds to the summary's match");
            Check(batch.Parts.Count == 2, "both players join the batch the summary described");
            var transport = new FakeTransport();
            transport.Replies.Add(() => Reply(200));
            var uploader = NewUploader(transport, "key");
            uploader.Observe("[WSettle] done v1 room-18 1\n", 1, 0);
            uploader.Observe(Line("room-18", 33, 1, 1, Body(33, false)), 1, 0);
            WaitFor(uploader, SettlementState.SentAll);
            Check(transport.Urls.Count == 1, "the summary still decides the all-sent state when it arrived first");
        }

        static void AKeySwitchKeepsTheFinishedMatch()
        {
            var log = new SettlementLog();
            var text = Line("room-a", 11, 1, 1, Body(11, false)) +
                Line("room-b", 22, 1, 1, Body(22, false)) +
                "[WSettle] done v1 room-b 1\n";
            var first = log.Feed(text);
            var second = log.Feed("");
            Check(first != null && first.MatchKey == "room-a" && first.Parts.Count == 1 && !first.HasSummary, "a key switch hands out the previous match instead of dropping it");
            Check(second != null && second.MatchKey == "room-b" && second.HasSummary && second.Parts[0].SteamId == 22, "the next match is handed out after it");
        }

        static void TrailingHalfLineWaitsForTheNextRead()
        {
            var log = new SettlementLog();
            var text = Line("room-19", 11, 1, 1, Body(11, false)) + "[WSettle] done v1 room-19 1\n";
            var cut = text.Length - 7;
            Check(log.Feed(text.Substring(0, cut)) == null, "a cut-off last line is not treated as lost");
            var batch = log.Feed(text.Substring(cut));
            Check(batch != null && batch.Parts.Count == 1 && batch.HasSummary, "the rest of the last line completes the same batch");
        }

        static void FinalReadAfterTheServerStops()
        {
            var path = Path.Combine(Path.GetTempPath(), "settlement-final-" + Guid.NewGuid().ToString("N") + ".log");
            try
            {
                File.WriteAllText(path, Line("room-21", 11, 1, 1, Body(11, false)));
                var tail = new SettlementTail();
                var log = new SettlementLog();
                Check(log.Feed(tail.Read(path)) == null, "the player line alone is not a finished batch");
                // The server closes its log and only then prints the summary; the last read must still collect it.
                File.AppendAllText(path, "[WSettle] done v1 room-21 1\n");
                var batch = log.Feed(tail.Read(path));
                Check(batch != null && batch.Parts.Count == 1 && batch.HasSummary, "the final read completes the round");
            }
            finally
            {
                File.Delete(path);
            }
        }

        static void FinalReadUploadsCompletePlayersWithoutTheSummary()
        {
            var transport = new FakeTransport();
            transport.Replies.Add(() => Reply(200));
            var uploader = NewUploader(transport, "key");
            var text = Line("room-23", 11, 1, 1, Body(11, false)) + "[WSettle] done v1 room-23 1";
            uploader.ObserveFinal(text, 1, 0);
            WaitFor(uploader, SettlementState.Partial);
            Check(transport.Urls.Count == 1, "a cut-off summary does not hold back the complete player");
            Check(((object[])Deserialize(transport.Bodies[0])["players"]).Length == 1, "the upload carries the complete player");
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
            uploader.Observe(Line("room-5", 11, 1, 1, Body(11, false)) + Line("room-5", 22, 1, 1, Body(22, false)) + "[Game] end game callback\n", 1, 0);
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
            uploader.Observe(Complete("room-6", 2), 1, 0);
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
            uploader.Observe(Complete("room-7", 2), 1, 0);
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
            uploader.Observe(Complete("room-13", 2), 1, 0);
            WaitFor(uploader, SettlementState.SentAll);
            Check(transport.Urls.Count == 3 && transport.Urls.TrueForAll(url => url == SettlementApi.Direct), "5xx answers stay on the direct route");
            Check(delays.Count == 2 && delays[0] == 1000 && delays[1] == 3000, "the three attempts are spaced one and three seconds apart");
        }

        static void ExplicitBadRequestStopsAtOnce()
        {
            var transport = new FakeTransport();
            transport.Replies.Add(() => Reply(400));
            var uploader = NewUploader(transport, "key");
            uploader.Observe(Complete("room-8", 2), 1, 0);
            WaitFor(uploader, SettlementState.Failed);
            Check(transport.Urls.Count == 1, "an explicit 4xx is not retried");
        }

        static void DeadlineStopsTheUpload()
        {
            long clock = 0;
            var transport = new FakeTransport();
            transport.BeforeReply = () => clock += 20000;
            transport.Replies.Add(() => Reply(0, false));
            transport.Replies.Add(() => Reply(0, false));
            transport.Replies.Add(() => Reply(0, false));
            var delays = new List<int>();
            var uploader = NewUploader(transport, "key", delays, () => clock, ms => clock += ms);
            uploader.Observe(Complete("room-9", 2), 1, 0);
            WaitFor(uploader, SettlementState.None);
            Check(transport.Urls.Count == 2, "the 30-second budget stops a third request");
        }

        static void LateSuccessCannotTurnGreen()
        {
            long clock = 0;
            var transport = new FakeTransport();
            transport.BeforeReply = () => clock += 31000;
            transport.Replies.Add(() => Reply(200));
            var uploader = NewUploader(transport, "key", null, () => clock, ms => clock += ms);
            uploader.Observe(Complete("room-20", 2), 1, 0);
            Check(transport.Entered.WaitOne(3000), "the late answer reaches the transport");
            WaitFor(uploader, SettlementState.None);
            Check(uploader.State != SettlementState.SentAll, "an answer past the whole budget cannot turn the result green");
        }

        static void ABlockedRequestEndsAtTheDeadline()
        {
            var transport = new FakeTransport { Block = true };
            transport.Replies.Add(() => Reply(200));
            var path = Path.Combine(Path.GetTempPath(), "settlement-sent-" + Guid.NewGuid().ToString("N") + ".txt");
            try
            {
                var uploader = new SettlementUploader(() => "key", transport, path, (state, round, game) => { }, null, () => Stopwatch.GetTimestamp() * 1000 / Stopwatch.Frequency, ms => Thread.Sleep(ms), 1000);
                uploader.Observe(Complete("room-22", 2), 1, 0);
                Check(transport.Entered.WaitOne(3000), "the blocked request reaches the transport");
                WaitFor(uploader, SettlementState.None);
                Thread.Sleep(100);
                Check(transport.Urls.Count == 1, "a hung request is not retried past the deadline");
                transport.Release.Set();
                Check(transport.Finished.WaitOne(3000), "the transport call is released afterwards");
                Thread.Sleep(50);
                Check(transport.Cancelled, "the deadline cancels the pending request");
                Check(uploader.State == SettlementState.None, "its late success cannot turn the result green");
            }
            finally
            {
                File.Delete(path);
            }
        }

        static void SuccessIsDeduplicatedLocally()
        {
            var transport = new FakeTransport();
            transport.Replies.Add(() => Reply(200));
            var path = Path.Combine(Path.GetTempPath(), "settlement-sent-" + Guid.NewGuid().ToString("N") + ".txt");
            try
            {
                var first = NewUploader(transport, "key", null, null, null, path);
                first.Observe(Complete("room-10", 2), 1, 0);
                WaitFor(first, SettlementState.SentAll);
                Check(transport.Urls.Count == 1, "a successful upload records its players");
                var second = NewUploader(transport, "key", null, null, null, path);
                second.Observe(Complete("room-10", 2), 1, 0);
                WaitFor(second, SettlementState.SentAll);
                Check(transport.Urls.Count == 1, "the same match and players are not sent again after a restart");
            }
            finally
            {
                File.Delete(path);
            }
        }

        static void DedupReadsPastTheOldLimit()
        {
            var path = Path.Combine(Path.GetTempPath(), "settlement-sent-" + Guid.NewGuid().ToString("N") + ".txt");
            try
            {
                var lines = new List<string>();
                for (var i = 0; i < 5000; i++) lines.Add("old-" + i + "\t1");
                lines.Add("room-late\t1");
                File.WriteAllLines(path, lines.ToArray());
                var transport = new FakeTransport();
                transport.Replies.Add(() => Reply(200));
                var uploader = NewUploader(transport, "key", null, null, null, path);
                uploader.Observe(Complete("room-late", 1), 1, 0);
                WaitFor(uploader, SettlementState.SentAll);
                Check(transport.Urls.Count == 0, "a record after the first 5000 lines still suppresses the upload");
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
            var uploader = new SettlementUploader(() => "", transport, null, (state, round, game) => { }, notes.Add);
            uploader.Observe(Complete("room-11", 2), 1, 0);
            Check(uploader.State == SettlementState.None && transport.Urls.Count == 0, "an empty key skips the upload without an error");
            Check(notes.Count == 1 && notes[0].IndexOf("LAUNCHER_APIKEY", StringComparison.Ordinal) >= 0, "one non-sensitive diagnostic explains the skip");
            uploader.Observe(Complete("room-11", 2), 1, 0);
            Check(notes.Count == 1, "the missing-key note is written once");
        }

        static void LateReplyCannotChangeTheNextRound()
        {
            var transport = new FakeTransport { Block = true };
            transport.Replies.Add(() => Reply(200));
            var uploader = NewUploader(transport, "key");
            uploader.Observe(Complete("room-12", 2), 1, 0);
            Check(transport.Entered.WaitOne(3000), "the first round reaches the transport");
            uploader.Reset(2);
            transport.Release.Set();
            transport.Finished.WaitOne(3000);
            Thread.Sleep(50);
            Check(uploader.State == SettlementState.None, "a late answer from the previous round does not change the current one");
        }

        static void CallbacksCarryTheCapturedRoomGame()
        {
            var transport = new FakeTransport { Block = true };
            transport.Replies.Add(() => Reply(200));
            var path = Path.Combine(Path.GetTempPath(), "settlement-sent-" + Guid.NewGuid().ToString("N") + ".txt");
            var seen = new List<string>();
            try
            {
                var uploader = new SettlementUploader(() => "key", transport, path, (state, round, game) =>
                {
                    lock (seen) seen.Add(round + "/" + game + "/" + (int)state);
                }, null, () => 0, ms => { }, 30000);
                uploader.Observe(Complete("room-24", 1), 1, 4);
                Check(transport.Entered.WaitOne(3000), "the first upload reaches the transport");
                uploader.Reset(2);
                uploader.Observe(Complete("room-25", 1), 2, 5);
                transport.Release.Set();
                WaitFor(() =>
                {
                    lock (seen) return seen.Contains("1/4/1") && seen.Contains("2/5/1");
                }, "both uploads report the game number captured when they started");
                Thread.Sleep(100);
                lock (seen)
                {
                    Check(!seen.Contains("1/4/3"), "the old upload's late success is not reported for its round");
                }
            }
            finally
            {
                File.Delete(path);
            }
        }

        // The whole packet path is exercised: the host's Send wraps the payload once and the joiner's Receive reads it.
        static void SettlementStateCrossesTheRealTunnel()
        {
            using (var server = new UdpClient(new IPEndPoint(IPAddress.Loopback, 0)))
            using (var host = new HostTunnel(((IPEndPoint)server.Client.LocalEndPoint).Port))
            using (var join = new JoinTunnel())
            {
                Platform.KeepPrivate(server.Client);
                host.RosterSource = () => new List<RosterEntry> { new RosterEntry { Name = "host", IsHost = true } };
                host.Start();
                join.Start();
                var token = Guid.NewGuid().ToString("N");
                host.AddJoin("settle", token, new List<Candidate>(), false, null);
                var path = join.Connect(token, new List<Candidate> { new Candidate(PathType.Stun, Address(host)) }, null);
                Check(path == PathType.Stun, "the settlement test joins over the direct route");
                join.Forward(0);
                host.Game = 1;
                host.Settlement = (int)SettlementState.Sending;
                WaitFor(() => join.Game == 1 && join.Settlement == (int)SettlementState.Sending, "the joiner receives the host's state");
                host.Game = 2;
                WaitFor(() => join.Game == 2 && join.Settlement == (int)SettlementState.Sending, "the next game carries the current state");
                var older = new byte[5];
                Buffer.BlockCopy(BitConverter.GetBytes(1), 0, older, 0, 4);
                older[4] = 1;
                SendFromHost(host, token, Packet.NextGame, older);
                Thread.Sleep(300);
                Check(join.Game == 2, "an older NextGame cannot move the joiner back");
                SendFromHost(host, token, Packet.Settlement, HostTunnel.EncodeSettlement(1, (int)SettlementState.Failed));
                Thread.Sleep(300);
                Check(join.Settlement == (int)SettlementState.Sending, "an older game's result cannot overwrite the current game");
                host.Settlement = 0;
                WaitFor(() => join.Settlement == 0, "the host returning to neutral reaches the joiner");
                SendFromHost(host, token, Packet.Settlement, HostTunnel.EncodeSettlement(1, (int)SettlementState.Failed));
                Thread.Sleep(300);
                Check(join.Settlement == 0, "a late older result cannot wake the finished game");
            }
        }

        static void BuildKeyIsMasked()
        {
            Check(BuildKey.Unpack("Lz4oL3YwPiI=") == "test-key", "the embedded key decodes through the build mask");
        }

        static SettlementUploader NewUploader(FakeTransport transport, string key, List<int> delays = null, Func<long> elapsed = null, Action<int> sleep = null, string dedupPath = null)
        {
            if (dedupPath == null) dedupPath = Path.Combine(Path.GetTempPath(), "settlement-sent-" + Guid.NewGuid().ToString("N") + ".txt");
            if (delays == null) delays = new List<int>();
            if (sleep == null) sleep = ms => { delays.Add(ms); Thread.Sleep(0); };
            return new SettlementUploader(() => key, transport, dedupPath, (state, round, game) => { }, null, elapsed ?? (() => 0), sleep);
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

        static void WaitFor(Func<bool> condition, string message)
        {
            for (var i = 0; i < 600; i++)
            {
                if (condition()) return;
                Thread.Sleep(25);
            }
            throw new Exception(message);
        }

        static void SendFromHost(HostTunnel host, string token, byte type, byte[] payload)
        {
            var peers = (IDictionary)typeof(HostTunnel).GetField("peers", BindingFlags.NonPublic | BindingFlags.Instance).GetValue(host);
            var peer = peers[token];
            var remote = (IPEndPoint)peer.GetType().GetField("Remote", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance).GetValue(peer);
            var socket = (UdpClient)typeof(Tunnel).GetField("Socket", BindingFlags.NonPublic | BindingFlags.Instance).GetValue(host);
            var packet = new byte[payload.Length + 1];
            packet[0] = type;
            Buffer.BlockCopy(payload, 0, packet, 1, payload.Length);
            socket.Send(packet, packet.Length, remote);
        }

        static IPEndPoint Address(Tunnel tunnel)
        {
            var socket = (UdpClient)typeof(Tunnel).GetField("Socket", BindingFlags.NonPublic | BindingFlags.Instance).GetValue(tunnel);
            return new IPEndPoint(IPAddress.Loopback, ((IPEndPoint)socket.Client.LocalEndPoint).Port);
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
            public volatile bool Cancelled;
            public Action BeforeReply;
            int index;

            public SettlementReply Post(string url, string json, string apiKey, int timeoutMs, CancellationToken cancel)
            {
                lock (sync)
                {
                    Urls.Add(url);
                    Bodies.Add(json);
                }
                Entered.Set();
                if (Block) Release.WaitOne(5000);
                if (cancel.IsCancellationRequested) Cancelled = true;
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
