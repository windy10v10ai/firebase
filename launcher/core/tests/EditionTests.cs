using System;
using System.Collections.Generic;

namespace Windy10v10AI.Launcher.Tests
{
    static class EditionTests
    {
        public static void RunAll()
        {
            MapIdsFollowEditionAndTestSwitch();
            UnknownEditionIsOriginal();
            PeerBodyCarriesEdition();
            RoomsWithoutEditionAreOriginal();
            ListedRoomsAndGamesReadEdition();
            MapNamesFollowTheEdition();
            Console.WriteLine("PASS Edition tests");
        }

        static void MapIdsFollowEditionAndTestSwitch()
        {
            Equal("2307479570", Editions.MapId(Editions.Original, false), "original edition uses the release map");
            Equal("3788870952", Editions.MapId(Editions.Anime, false), "anime edition uses its own map");
            Equal("2636824668", Editions.MapId(Editions.Original, true), "test switch picks the test map for the original edition");
            Equal("2636824668", Editions.MapId(Editions.Anime, true), "test switch lends the test map to the anime edition");
        }

        static void UnknownEditionIsOriginal()
        {
            Equal(Editions.Original, Editions.Normalize(null), "missing edition is the original");
            Equal(Editions.Original, Editions.Normalize("other"), "unknown edition is the original");
            Equal(Editions.Anime, Editions.Normalize("anime"), "anime stays anime");
        }

        static void PeerBodyCarriesEdition()
        {
            var original = RoomPeer.Body(1, "10", new List<Candidate>(), null);
            Equal(Editions.Original, (string)original["edition"], "a body without an edition is the original");
            var anime = RoomPeer.Body(1, "10", new List<Candidate>(), null, Editions.Anime);
            Equal(Editions.Anime, (string)anime["edition"], "the body carries the anime edition");
        }

        static void RoomsWithoutEditionAreOriginal()
        {
            var row = RoomBrowser.Parse(new Dictionary<string, object> { { "code", "ABC123" } });
            Equal(Editions.Original, row.Edition, "a room from an older API is the original edition");
        }

        static void ListedRoomsAndGamesReadEdition()
        {
            var room = RoomBrowser.Parse(new Dictionary<string, object> { { "code", "ABC123" }, { "edition", "anime" } });
            Equal(Editions.Anime, room.Edition, "a listed room keeps its edition");
            var game = RoomBrowser.ParseGame(new Dictionary<string, object> { { "edition", "anime" } });
            Equal(Editions.Anime, game.Edition, "a game in progress keeps its edition");
        }

        static void MapNamesFollowTheEdition()
        {
            Equal(Strings.MapNameOriginal, Strings.MapName(Editions.Original), "original map name");
            Equal(Strings.MapNameAnime, Strings.MapName(Editions.Anime), "anime map name");
            if (!Strings.NoMapFor(Editions.Anime).Contains(Strings.MapNameAnime)) throw new Exception("the missing map hint names the anime edition");
            if (Strings.EditionSwitchPrompt(Editions.Anime) == Strings.EditionSwitchPrompt(Editions.Original)) throw new Exception("the switch prompt names the room's edition");
        }

        static void Equal(string expected, string actual, string message)
        {
            if (expected != actual) throw new Exception(message + ": expected " + expected + " but got " + actual);
        }
    }
}
