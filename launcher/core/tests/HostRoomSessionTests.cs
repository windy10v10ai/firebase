using System;
using System.Collections.Generic;
using System.Reflection;
using System.Threading;

namespace Windy10v10AI.Launcher.Tests
{
    static class HostRoomSessionTests
    {
        public static void RunAll()
        {
            RoomLifecycleAndScheduling();
            FailedPollRetainsJoinResults();
            StaleRepliesCannotChangeTheNextGame();
            CloseFollowsTheLastHeartbeat();
            ProbesAndExcludedPlayersStayOutOfTheRoster();
            Console.WriteLine("PASS shared host room lifecycle, polling and retry");
        }
        static Dictionary<string, object> Opened()
        {
            return new Dictionary<string, object> { { "code", "AB12CD" }, { "token", "host-token" }, { "personaName", "host" }, { "joins", new object[0] } };
        }
        static void RoomLifecycleAndScheduling()
        {
            var time = DateTime.UtcNow;
            var calls = new List<Dictionary<string, object>>();
            using (var room = new HostRoomSession(new HostTunnel(), new HostRoster(), body => { calls.Add(body); return Opened(); }, () => time))
            {
                room.Map = "hard"; room.Configure(true, 4);
                room.Open(new Dictionary<string, object> { { "mapVersion", "first" } }, 123, false);
                Check(room.Code == "AB12CD" && room.Roster.Find("host").Status == PlayerStatus.InRoom, "opening retains authenticated room and host identity");
                Check(!room.Tunnel.GameReady, "opening does not release players before the server is ready");
                room.UpdateReadiness(false, true, false, false, time);
                Check(!room.Tunnel.GameReady, "host presence alone cannot bypass server readiness");
                room.UpdateReadiness(true, false, false, false, time);
                Check(room.Tunnel.GameReady, "server-only host releases guests when ready");
                Reject(() => room.NextGame("easy", "second"), "next game waits for results");
                room.Poll(); Check(room.NextPollAt == time.AddSeconds(2), "new room polls quickly");
                Check(!room.Poll(), "platform ticks do not multiply heartbeat requests");
                time = time.AddMinutes(6); room.Poll(); Check(room.NextPollAt == time.AddSeconds(5), "older waiting room polls slowly");
                room.Roster.Add(new RosterEntry { Key = "guest", SteamId = 456, Status = PlayerStatus.InRoom });
                room.Kick("host"); Check(room.Roster.Find("host") != null, "host cannot kick themselves");
                room.Kick("guest");
                Check(room.Roster.Find("guest") == null && ((long[])room.Snapshot()["kickedSteamIds"])[0] == 456, "kick removes the guest and persists exclusion");
                room.TrackServerLog("DOTA_GAMERULES_STATE_HERO_SELECTION");
                time = time.AddSeconds(5); room.Poll(); Check(room.NextPollAt == time.AddSeconds(60), "active game uses game heartbeat interval");
                Check(room.TrackServerLog("/api/game/end") && room.Ended && !room.Saved && room.Tunnel.GameEnded, "game end reaches guests before result completion");
                room.TrackServerLog("[Game] end game callback");
                room.NextGame("easy", "second");
                var state = room.Snapshot();
                Check(room.Game == 2 && !room.Started && !room.Ended && !room.Saved && !room.Tunnel.GameReady, "next game resets state without closing the room");
                Check(room.Code == "AB12CD" && (string)state["mapVersion"] == "second" && (string)state["map"] == "easy", "next game retains credentials and switches map version");
                time = time.AddMinutes(16); room.Poll();
                Check(room.Paused && false.Equals(calls[calls.Count - 1]["public"]), "idle room is hidden and polling pauses");
                var count = calls.Count; room.Poll(); Check(calls.Count == count, "paused room stops heartbeat traffic");
                room.Reopen(); room.Poll(); Check(!room.Paused && true.Equals(calls[calls.Count - 1]["public"]), "reopening republishes room settings");
                room.Close(); count = calls.Count; room.Poll();
                Check(calls.Count == count && true.Equals(calls[count - 1]["ended"]) && false.Equals(calls[count - 1]["public"]), "closing hides room and stops future polls");
            }
        }
        static void FailedPollRetainsJoinResults()
        {
            var time = DateTime.UtcNow;
            var calls = new List<Dictionary<string, object>>(); bool fail = true;
            using (var tunnel = new HostTunnel())
            using (var room = new HostRoomSession(tunnel, new HostRoster(), body =>
            {
                calls.Add(body);
                if (body.ContainsKey("code") && fail) { fail = false; throw new Exception("network"); }
                return Opened();
            }, () => time))
            {
                room.Open(new Dictionary<string, object>(), 123, true);
                var finished = (Action<string, string, string, int>)typeof(HostTunnel).GetField("JoinFinished", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(tunnel);
                finished("guest", "direct", null, 20);
                room.Poll(); Check(room.Failures == 1, "poll failure is recorded");
                time = time.AddSeconds(2); room.Poll();
                Check(((Dictionary<string, object>[])calls[1]["results"]).Length == 1 && ((Dictionary<string, object>[])calls[2]["results"]).Length == 1, "failed join results are retried");
                time = time.AddSeconds(2); room.Poll();
                Check(((Dictionary<string, object>[])calls[3]["results"]).Length == 0 && room.Failures == 0, "acknowledged results are removed");
            }
        }
        static void StaleRepliesCannotChangeTheNextGame()
        {
            var time = DateTime.UtcNow; HostRoomSession room = null; bool advance = false;
            var guest = new Dictionary<string, object> { { "joinId", "late" }, { "joinToken", "late-token" }, { "steamId", 456 }, { "candidates", new object[0] } };
            using (room = new HostRoomSession(new HostTunnel(), new HostRoster(), body =>
            {
                if (advance)
                {
                    advance = false;
                    room.TrackServerLog("/api/game/end\n[Game] end game callback");
                    room.NextGame("hard", "second");
                    var reply = Opened(); reply["joins"] = new object[] { guest }; return reply;
                }
                return Opened();
            }, () => time))
            {
                room.Open(new Dictionary<string, object>(), 123, true);
                advance = true; room.Poll();
                Check(room.Game == 2 && room.Roster.Find("late") == null && !room.Tunnel.GameReady, "old heartbeat reply cannot add joiners to the next game");
                room.Close();
                Check(!room.Poll(), "closed session cannot resume polling");
            }
        }
        static void CloseFollowsTheLastHeartbeat()
        {
            var entered = new ManualResetEvent(false);
            var release = new ManualResetEvent(false);
            var hidden = new ManualResetEvent(false);
            var calls = new List<Dictionary<string, object>>();
            using (var room = new HostRoomSession(new HostTunnel(), new HostRoster(), body =>
            {
                calls.Add(body);
                if (body.ContainsKey("code") && false.Equals(body["ended"])) { entered.Set(); if (!release.WaitOne(3000)) throw new Exception("heartbeat was not released"); }
                if (body.ContainsKey("code") && true.Equals(body["ended"])) hidden.Set();
                return Opened();
            }, () => DateTime.UtcNow))
            {
                room.Configure(true, 4); room.Open(new Dictionary<string, object>(), 123, true);
                var poll = new Thread(() => room.Poll()); poll.Start();
                Check(entered.WaitOne(3000), "heartbeat reaches the request");
                Check(!room.Poll(), "another platform tick cannot overlap an in-flight heartbeat");
                var close = new Thread(room.Close); close.Start();
                Check(!hidden.WaitOne(100), "closing waits for the in-flight heartbeat");
                release.Set();
                Check(poll.Join(3000) && close.Join(3000), "heartbeat and close both finish");
                var last = calls[calls.Count - 1];
                Check(hidden.WaitOne(0) && false.Equals(last["public"]) && true.Equals(last["ended"]), "final request hides the room after its last heartbeat");
                Check(!room.Poll(), "late ticks cannot reopen a closed room");
            }
            entered.Dispose(); release.Dispose(); hidden.Dispose();
        }
        static void ProbesAndExcludedPlayersStayOutOfTheRoster()
        {
            Func<string, long, bool, Dictionary<string, object>> join = (id, steam, probe) => new Dictionary<string, object>
            { { "joinId", id }, { "joinToken", id + "-token" }, { "steamId", steam }, { "probe", probe }, { "candidates", new object[0] } };
            using (var room = new HostRoomSession(new HostTunnel(), new HostRoster(), body =>
            {
                var reply = Opened();
                reply["joins"] = new object[] { join("probe", 0, true), join("kicked", 456, false), join("guest", 789, false) };
                return reply;
            }, () => DateTime.UtcNow))
            {
                room.Open(new Dictionary<string, object>(), 123, true);
                room.Roster.Add(new RosterEntry { Key = "old", SteamId = 456, Status = PlayerStatus.InRoom }); room.Kick("old");
                room.Poll();
                Check(room.Roster.Find("probe") == null && room.Roster.Find("kicked") == null && room.Roster.Find("guest") != null, "browser probes and excluded players are not roster members");
                var players = (long[])room.Snapshot()["players"];
                Check(players.Length == 1 && players[0] == 789, "heartbeat includes only current guests");
            }
        }
        static void Reject(Action action, string message) { try { action(); } catch { return; } throw new Exception(message); }
        static void Check(bool condition, string message) { if (!condition) throw new Exception(message); }
    }
}
