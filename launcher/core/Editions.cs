namespace Windy10v10AI.Launcher
{
    // Which map the player runs. Both editions share the backend, so a room carries the edition it was opened with
    static class Editions
    {
        public const string Original = "original";
        public const string Anime = "anime";
        public const string OriginalMapId = "2307479570";
        public const string AnimeMapId = "3788870952";
        // The anime edition has no test map of its own yet, so the test switch lends it the original's
        public const string TestMapId = "2636824668";

        // Anything unknown, including a missing field from an older API, is the original edition
        public static string Normalize(string edition)
        {
            return edition == Anime ? Anime : Original;
        }

        public static string MapId(string edition, bool testMap)
        {
            if (testMap) return TestMapId;
            return Normalize(edition) == Anime ? AnimeMapId : OriginalMapId;
        }
    }
}
