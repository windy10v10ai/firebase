using System;
using System.Collections.Generic;
using System.IO;
using System.Threading;

namespace Windy10v10AI.Launcher.Tests
{
    static class GameRelayTests
    {
        sealed class FakeTransport : IRelayTransport
        {
            public readonly List<string> Urls = new List<string>();
            public Func<string, RelayReply> Handler;

            public RelayReply Get(string url, string apiKey, int timeoutMs)
            {
                lock (Urls) Urls.Add(url);
                return Handler(url);
            }
        }

        public static void RunAll()
        {
            ParsesOnlyWellFormedRequestLines();
            OnlyListedReadRoutesAreForwarded();
            AnswerLandsInTheKvFileAndKeepsEarlierAnswers();
            HalfLineWaitsForTheNextRead();
            NoAnswerSwitchesToTheRelayRoute();
            RefusedPathAndMissingKeyAnswerWithoutCallingOut();
            StopRemovesTheMarkerFile();
        }

        static string TempFile()
        {
            var dir = Path.Combine(Path.GetTempPath(), "relay-test-" + Guid.NewGuid().ToString("N"));
            return Path.Combine(dir, "scripts", "kv", "launcher_relay.kv");
        }

        static string WaitFor(string file, string needle)
        {
            for (var i = 0; i < 100; i++)
            {
                if (File.Exists(file))
                {
                    try
                    {
                        var text = File.ReadAllText(file);
                        if (text.Contains(needle)) return text;
                    }
                    catch (IOException)
                    {
                    }
                }
                Thread.Sleep(50);
            }
            throw new Exception("GameRelay: timed out waiting for " + needle);
        }

        static string Answer(int id)
        {
            return "\t\"" + id + "\"\n\t{";
        }

        static void Check(bool ok, string name)
        {
            if (!ok) throw new Exception("GameRelay: " + name);
        }

        static void ParsesOnlyWellFormedRequestLines()
        {
            var requests = GameRelay.Parse("11/22 01:29:37 [VScript] [WReq] v1 7 15 /game/start?steamIds=1,2");
            Check(requests.Count == 1 && requests[0].Id == 7 && requests[0].TimeoutSeconds == 15 && requests[0].Path == "/game/start?steamIds=1,2", "request fields");
            Check(GameRelay.Parse("[WReq] v1 7 999 /player/1/info")[0].TimeoutSeconds == 20, "timeout cap");
            Check(GameRelay.Parse("[WReq] v1 x 15 /player/1/info").Count == 0, "bad id");
            Check(GameRelay.Parse("[WReq] v2 7 15 /player/1/info").Count == 0, "other version");
            Check(GameRelay.Parse("[WReq] v1 7 15 /a /b").Count == 0, "extra token");
        }

        static void OnlyListedReadRoutesAreForwarded()
        {
            Check(GameRelay.IsAllowed("/game/start?steamIds=1,2&matchId=3&version=v4.1"), "game start");
            Check(GameRelay.IsAllowed("/player/123/info?include=member,property"), "player info");
            Check(GameRelay.IsAllowed("/daily-task/123"), "daily task");
            Check(!GameRelay.IsAllowed("/game/end/local"), "settlement is not a read");
            Check(!GameRelay.IsAllowed("/player/123/setting"), "other player route");
            Check(!GameRelay.IsAllowed("/player/abc/info"), "non numeric id");
            Check(!GameRelay.IsAllowed("/game/start?x=%0d%0a"), "odd characters");
        }

        static void AnswerLandsInTheKvFileAndKeepsEarlierAnswers()
        {
            var file = TempFile();
            var body = "{\"a\":\"中\"}";
            var transport = new FakeTransport { Handler = url => new RelayReply { Answered = true, Status = 200, Body = body } };
            var relay = new GameRelay(() => "key", transport, delegate { });
            relay.Start(file);
            Check(File.ReadAllText(file).Contains("\"launcher\"\t\"1\""), "marker written at start");
            relay.Observe("noise\n[WReq] v1 1 10 /player/5/info\n");
            var text = WaitFor(file, Answer(1));
            Check(text.Contains("\"status\"\t\"200\""), "status");
            Check(text.Contains(GameRelay.Encode(body)), "body is base64url of UTF-8");
            relay.Observe("[WReq] v1 2 10 /daily-task/5\n");
            text = WaitFor(file, Answer(2));
            Check(text.Contains(Answer(1)), "earlier answer kept");
            relay.Observe("[WReq] v1 2 10 /daily-task/5\n");
            Thread.Sleep(200);
            Check(transport.Urls.Count == 2, "a repeated id is answered once");
            Check(transport.Urls[0] == LauncherApi.Api + "player/5/info", "direct url");
            relay.Stop();
        }

        static void HalfLineWaitsForTheNextRead()
        {
            var file = TempFile();
            var transport = new FakeTransport { Handler = url => new RelayReply { Answered = true, Status = 200, Body = "x" } };
            var relay = new GameRelay(() => "key", transport, delegate { });
            relay.Start(file);
            relay.Observe("[WReq] v1 9 10 /player/");
            Thread.Sleep(150);
            Check(transport.Urls.Count == 0, "half line not served");
            relay.Observe("5/info\n");
            WaitFor(file, Answer(9));
            Check(transport.Urls[0] == LauncherApi.Api + "player/5/info", "joined line");
            relay.Stop();
        }

        static void NoAnswerSwitchesToTheRelayRoute()
        {
            var file = TempFile();
            var transport = new FakeTransport
            {
                Handler = url => url.StartsWith(LauncherApi.Api, StringComparison.Ordinal)
                    ? new RelayReply()
                    : new RelayReply { Answered = true, Status = 200, Body = "ok" }
            };
            var relay = new GameRelay(() => "key", transport, delegate { });
            relay.Start(file);
            relay.Observe("[WReq] v1 3 10 /player/5/info\n");
            var text = WaitFor(file, Answer(3));
            Check(text.Contains("\"status\"\t\"200\""), "relay route answer");
            Check(transport.Urls.Count == 2 && transport.Urls[1] == LauncherApi.RelayApi + "player/5/info", "second url");
            relay.Stop();
        }

        static void RefusedPathAndMissingKeyAnswerWithoutCallingOut()
        {
            var file = TempFile();
            var transport = new FakeTransport { Handler = url => new RelayReply { Answered = true, Status = 200 } };
            var relay = new GameRelay(() => "key", transport, delegate { });
            relay.Start(file);
            relay.Observe("[WReq] v1 4 10 /game/end/local\n");
            Check(WaitFor(file, Answer(4)).Contains("\"status\"\t\"403\""), "refused");
            Check(transport.Urls.Count == 0, "nothing sent for a refused path");
            relay.Stop();

            var noKey = new GameRelay(() => "", transport, delegate { });
            noKey.Start(file);
            noKey.Observe("[WReq] v1 5 10 /player/5/info\n");
            Check(WaitFor(file, Answer(5)).Contains("\"status\"\t\"401\""), "no key");
            Check(transport.Urls.Count == 0, "nothing sent without a key");
            noKey.Stop();
        }

        static void StopRemovesTheMarkerFile()
        {
            var file = TempFile();
            var relay = new GameRelay(() => "key", new FakeTransport { Handler = url => new RelayReply() }, delegate { });
            relay.Start(file);
            Check(File.Exists(file), "created");
            relay.Stop();
            Check(!File.Exists(file), "removed");
        }
    }
}
