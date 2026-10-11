using System;

namespace Windy10v10AI.Launcher.Tests
{
    static class AddonCorruptTests
    {
        public static void RunAll()
        {
            True(MainForm.AddonCorrupt(
                "WARNING: File might be corrupt or missing - 'c:\\games\\steamapps\\common\\dota 2 beta\\game\\dota_addons\\2307479570\\pak01.vpk'\r\n" +
                "FATAL ERROR: Content file c:\\games\\steamapps\\common\\dota 2 beta\\game\\dota_addons\\2307479570\\pak01.vpk is corrupt. Verify integrity of game files.\r\n"),
                "detects a corrupt map");
            True(!MainForm.AddonCorrupt(
                "FATAL ERROR: Content file c:\\games\\steamapps\\common\\dota 2 beta\\game\\dota\\pak01_042.vpk is corrupt. Verify integrity of game files.\r\n" +
                "Mounting addon 'dota_addons\\2307479570'\r\n"),
                "ignores corrupt Dota files");
            True(!MainForm.AddonCorrupt("Host activate: Idle (console)\r\n"), "ignores a normal log");
            Console.WriteLine("PASS Addon corrupt tests");
        }

        static void True(bool condition, string name)
        {
            if (!condition) throw new Exception(name);
        }
    }
}
