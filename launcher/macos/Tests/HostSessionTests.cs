using System.Collections.Concurrent;
using System.Reflection;
using System.Text.Json;

namespace Windy10v10AI.Launcher
{
    static class HostSessionTests
    {
        public static void RunAll()
        {
            RoomRequestsFollowSettingsAndKicks();
            ResultsGateTheNextGame();
            SoloKeepsAnUnfinishedGameAndStopsAfterResults();
            BrowserUsesTheSharedRoomRows();
            Console.WriteLine("PASS host settings, kicks, result lifecycle and room browser bridge");
        }

        static void RoomRequestsFollowSettingsAndKicks()
        {
            var events = new List<JsonElement>();
            var host = new HostSession(value => events.Add(JsonSerializer.SerializeToElement(value)));
            using var tunnel = new HostTunnel();
            Set(host, "<Tunnel>k__BackingField", tunnel);
            Set(host, "worker", new TaskCompletionSource().Task);
            Set(host, "body", new Dictionary<string, object> { { "mapVersion", "offline" } });
            Set(host, "mode", "hard"); Set(host, "game", 2); Set(host, "started", true);
            host.Roster.Add(new RosterEntry { Key = "host", SteamId = 123, IsHost = true });
            host.Roster.Add(new RosterEntry { Key = "guest", SteamId = 456, Name = "guest", Status = PlayerStatus.InRoom });
            host.Roster.Add(new RosterEntry { Key = "left", SteamId = 789, Status = PlayerStatus.Left });
            host.ConfigureRoom(true, 4);
            var request = Body(host);
            Check(true.Equals(request["public"]) && (int)request["maxPlayers"] == 4, "public room settings reach the request");
            Check((string)request["map"] == "hard" && (int)request["game"] == 2 && true.Equals(request["started"]), "request retains current game state");
            Check(((long[])request["players"]).SequenceEqual(new long[] { 456 }), "only active identified guests reach the API");
            Reject(() => host.ConfigureRoom(false, 1), "cannot reduce capacity below supported player limit");
            host.Kick("host"); Check(host.Roster.Find("host") != null, "host cannot kick themselves");
            host.Kick("guest");
            request = Body(host);
            Check(host.Roster.Find("guest") == null && ((long[])request["kickedSteamIds"]).SequenceEqual(new long[] { 456 }), "kick removes the player and persists API exclusion");
            var roster = events.Last(e => e.GetProperty("type").GetString() == "roster");
            Check(roster.GetProperty("players").EnumerateArray().All(p => p.TryGetProperty("key", out _) && p.TryGetProperty("steamId", out _) && p.TryGetProperty("avatarUrl", out _)), "roster carries native UI identity and avatar fields");
            host.ConfigureRoom(false, 2); Check(false.Equals(Body(host)["public"]), "friends room settings reach the request");
        }

        static void ResultsGateTheNextGame()
        {
            var host = new HostSession(_ => { }) { LocalTestSkipLatestCheck = true };
            Reject(() => host.Next("hard"), "next game waits for saved results");
            Call(host, "ServerLine", "request /api/game/end");
            Check(host.Saving && host.State == "saving", "game end waits for the result callback");
            Reject(() => host.Next("hard"), "game end alone cannot start the next game");
            Call(host, "ServerLine", "[Game] end game callback");
            Check(!host.Saving && host.State == "ended", "saved result unlocks the room");
            host.Next("hard"); host.Next("easy");
            var queue = (ConcurrentQueue<string>)Get(host, "next");
            Check(queue.Count == 1 && queue.TryPeek(out var mode) && mode == "hard", "only one next game can be queued");
            Set(host, "<Solo>k__BackingField", true);
            Reject(() => host.Next("hard"), "single player never starts a room next game");
        }

        static void SoloKeepsAnUnfinishedGameAndStopsAfterResults()
        {
            var lifecycle = new SoloLifecycle();
            var now = DateTime.UtcNow;
            Check(!lifecycle.Observe(false, null, false, now), "waiting for the initial client does not stop the server");
            Check(!lifecycle.Observe(true, now, false, now), "playing keeps the server");
            Check(!lifecycle.Observe(true, now, false, now.AddSeconds(31)), "leaving an unfinished game keeps it available");
            Check(lifecycle.Observe(true, now, true, now.AddSeconds(31)), "saved results and leaving stop the server");
            lifecycle.Reset();
            lifecycle.Observe(true, now, false, now);
            Check(lifecycle.Observe(false, now, false, now.AddSeconds(1)), "closing the client during a game stops the solo server");
            lifecycle.Reset();
            Check(!lifecycle.Observe(true, now, true, now), "saved results do not stop a client still in the game");
        }

        static void BrowserUsesTheSharedRoomRows()
        {
            JsonElement? result = null;
            using var rooms = new MacRooms(value => result = JsonSerializer.SerializeToElement(value), new HostSession(_ => { }));
            using var browser = new RoomBrowser(() => new(), (_, _) => new(), false);
            var rows = (List<RoomRow>)typeof(RoomBrowser).GetField("rows", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(browser);
            rows.Add(new RoomRow { Kind = RowKind.Waiting, Code = "AB12CD", Map = "hard", Name = "host", Players = 2, MaxPlayers = 4, Probe = ProbeState.Reachable, Rtt = 12 });
            browser.Loaded = true;
            typeof(MacRooms).GetMethod("Publish", BindingFlags.Instance | BindingFlags.NonPublic).Invoke(rooms, new object[] { browser });
            var row = result.Value.GetProperty("rows")[0];
            Check(row.GetProperty("code").GetString() == "AB12CD" && row.GetProperty("joinable").GetBoolean() && row.GetProperty("latency").GetInt32() == 12, "native list preserves shared room selection and measured latency");
            Check(!result.Value.GetProperty("loading").GetBoolean() && !result.Value.GetProperty("failed").GetBoolean(), "native list publishes shared loaded state");
        }

        static Dictionary<string, object> Body(HostSession host) => (Dictionary<string, object>)Call(host, "HostBody");
        static object Call(object target, string name, params object[] args) => target.GetType().GetMethod(name, BindingFlags.Instance | BindingFlags.NonPublic).Invoke(target, args);
        static void Set(object target, string name, object value) => target.GetType().GetField(name, BindingFlags.Instance | BindingFlags.NonPublic).SetValue(target, value);
        static object Get(object target, string name) => target.GetType().GetField(name, BindingFlags.Instance | BindingFlags.NonPublic).GetValue(target);
        static void Check(bool condition, string message) { if (!condition) throw new Exception(message); }
        static void Reject(Action action, string message) { try { action(); } catch { return; } throw new Exception(message); }
    }
}
