using System;

namespace Windy10v10AI.Launcher.Tests
{
    static class SessionLifecycleTests
    {
        public static void RunAll()
        {
            ResultsCompleteBeforeNextGame();
            JoinAcrossGames();
            RoomDeparture();
            Console.WriteLine("PASS shared game results and room lifecycle");
        }

        static void ResultsCompleteBeforeNextGame()
        {
            var end = new GameEnd();
            var now = DateTime.UtcNow;
            Check(!end.Track("[Game] end game callback", now) && !end.Saved, "callback alone cannot end a game");
            Check(end.Track("/api/game/end", now) && end.Ended && !end.Saved, "results request starts saving");
            Check(!end.Track("", now.AddSeconds(4)), "wait for results before allowing the next game");
            Check(end.Track("[Game] end game callback", now.AddSeconds(4)) && end.Saved, "callback finishes saving");
            Check(!end.Track("/api/game/end", now.AddSeconds(10)), "duplicate log does not repeat the transition");
            end.Reset();
            Check(!end.Ended && !end.Saved, "next game starts with fresh result state");
            Check(end.Track("entering state 'DOTA_GAMERULES_STATE_POST_GAME'", now), "post-game state also starts saving");
            Check(end.Track("", now.AddSeconds(6)) && end.Saved, "missing script callback uses the result timeout");
        }

        static void JoinAcrossGames()
        {
            var join = new JoinLifecycle(3, false);
            join.Observe(3, false, true, false, false, false);
            Check(join.State == JoinState.Waiting && !join.NewGameReady, "wait for the host roster before entering");
            join.Observe(3, true, true, false, false, false);
            Check(join.NewGameReady && join.FirstGame, "joining an existing room enters its current game first");
            join.Observe(3, true, false, false, false, false);
            join.Observe(3, true, true, false, false, false);
            Check(!join.NewGameReady, "readiness changes do not launch the same game twice");
            join.Observe(3, true, true, true, false, false);
            Check(join.State == JoinState.Ended, "stay in the room after the game ends");
            join.Observe(4, true, false, false, false, false);
            Check(join.GameChanged && join.State == JoinState.Waiting, "next game waits for the host server");
            join.Observe(4, true, true, false, false, false);
            Check(join.NewGameReady && !join.FirstGame, "next game uses the existing-client entry policy");
            join.Observe(4, true, true, false, false, false);
            Check(!join.NewGameReady, "next game entry is offered once");
            join = new JoinLifecycle(4, true);
            join.Observe(4, true, true, false, false, false);
            Check(!join.NewGameReady, "an already entered game is not launched again");
        }

        static void RoomDeparture()
        {
            var join = new JoinLifecycle(1, false);
            join.Observe(1, true, true, false, false, true);
            Check(join.State == JoinState.HostLost, "host loss during a game is an error");
            join.Observe(1, true, true, true, false, true);
            Check(join.State == JoinState.Closed, "host closing a finished room is normal");
            join.Observe(2, true, false, false, false, true);
            Check(join.State == JoinState.Closed, "closing between games is normal");
            join.Observe(2, true, false, false, true, true);
            Check(join.State == JoinState.Kicked, "kick reason takes priority over lost connection");
        }

        static void Check(bool condition, string message)
        {
            if (!condition) throw new Exception(message);
        }
    }
}
