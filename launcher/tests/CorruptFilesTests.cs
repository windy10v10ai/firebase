using System;

namespace Windy10v10AI.Launcher.Tests
{
    static class CorruptFilesTests
    {
        public static void RunAll()
        {
            Equal(Strings.MapCorrupt, MainForm.CorruptFilesText(
                "WARNING: File might be corrupt or missing - 'c:\\games\\steamapps\\common\\dota 2 beta\\game\\dota_addons\\2307479570\\pak01.vpk'\r\n" +
                "FATAL ERROR: Content file c:\\games\\steamapps\\common\\dota 2 beta\\game\\dota_addons\\2307479570\\pak01.vpk is corrupt. Verify integrity of game files.\r\n"),
                "detects a corrupt map in the server log");
            Equal(Strings.MapCorrupt, MainForm.CorruptFilesText(
                "FATAL ERROR: Content file c:\\program files (x86)\\steam\\steamapps\\workshop\\content\\570\\2307479570\\2307479570.vpk is corrupt. Verify integrity of game files.\r\n"),
                "detects a corrupt map in a joiner's client log");
            Equal(Strings.GameFilesCorrupt, MainForm.CorruptFilesText(
                "Failed to load. pName='DOTAHeroes' pFileName='scripts/npc/npc_heroes.txt'\r\n" +
                "WARNING: Local content might be corrupt or missing files\r\n" +
                "No scripts/items/items_game.txt file found\r\n" +
                "FATAL ERROR: System DOTA_BotCommander failed to init\r\n"),
                "detects missing Dota files");
            Equal(Strings.GameFilesCorrupt, MainForm.CorruptFilesText(
                "FATAL ERROR: Content file c:\\games\\steamapps\\common\\dota 2 beta\\game\\dota\\pak01_042.vpk is corrupt. Verify integrity of game files.\r\n" +
                "Mounting addon 'dota_addons\\2307479570'\r\n"),
                "tells corrupt Dota files apart from the map");
            Equal(null, MainForm.CorruptFilesText("WARNING: Local content might be corrupt or missing files\r\nHost activate: Idle (console)\r\n"),
                "ignores the corruption warning when nothing failed");
            Equal(null, MainForm.CorruptFilesText("Host activate: Idle (console)\r\nShutting down\r\n"), "ignores a normal exit");
            Console.WriteLine("PASS Corrupt files tests");
        }

        static void Equal(string expected, string actual, string name)
        {
            if (expected != actual) throw new Exception(name + ": expected <" + expected + "> but got <" + actual + ">");
        }
    }
}
