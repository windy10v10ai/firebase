namespace Windy10v10AI.Launcher
{
    static class MacMapTests
    {
        public static void RunAll()
        {
            Check(MacInstall.ReadAccountId("\"76561197960265729\" { \"AutoLogin\" \"1\" }\n\"76561197960265730\" { \"MostRecent\" \"1\" }") == 2,
                "MostRecent wins over a stale AutoLogin account");
            Check(MacInstall.ReadAccountId("\"76561197960265729\" { \"AutoLogin\" \"1\" }") == 1,
                "A unique AutoLogin supports Steam files without MostRecent");
            Check(MacInstall.ReadAccountId("\"76561197960265729\" { \"AutoLogin\" \"1\" }\n\"76561197960265730\" { \"AutoLogin\" \"1\" }") == 0,
                "Ambiguous automatic accounts do not choose an arbitrary player");
            var root = Path.Combine(Path.GetTempPath(), "windymac-map-test-" + Guid.NewGuid().ToString("N"));
            try
            {
                var game = Path.Combine(root, "steamapps/common/dota 2 beta/game");
                var exe = Path.Combine(game, "bin/osx64/dota2.app/Contents/MacOS/dota2");
                Directory.CreateDirectory(Path.GetDirectoryName(exe)); File.WriteAllText(exe, "fixture");
                var install = MacInstall.FindIn(root, MacInstall.ReleaseMapId, false);
                Check(install.MapState(null) == "missing", "Missing map still allows an install for updating");
                Throws(() => MacInstall.FindIn(root, MacInstall.ReleaseMapId, true), "Starting requires a downloaded map");
                var map = Path.Combine(root, "steamapps/workshop/content/570", MacInstall.ReleaseMapId, MacInstall.ReleaseMapId + ".vpk");
                Directory.CreateDirectory(Path.GetDirectoryName(map)); File.WriteAllText(map, "downloaded map");
                var acf = Path.Combine(root, "steamapps/workshop/appworkshop_570.acf");
                File.WriteAllText(acf, "\"" + MacInstall.ReleaseMapId + "\" { \"manifest\" \"123\" \"timeupdated\" \"10\" }\n\"" + MacInstall.ReleaseMapId + "\" { \"latest_timeupdated\" \"20\" }");
                install = MacInstall.FindIn(root, MacInstall.ReleaseMapId, true);
                Check(install.Manifest == "123" && install.MapState("123") == "ready", "Installed manifest matches published version");
                Check(install.MapState("124") == "outdated" && install.MapState(null) == "outdated", "Published and known Steam updates are detected");
                Check(MacInstall.FindIn(root, MacInstall.TestMapId, false).MapState(null) == "missing", "Test and release maps are checked independently");
                MacInstall.UseTestMap = true;
                Check(MacInstall.MapId == MacInstall.TestMapId && install.Addon.EndsWith(MacInstall.ReleaseMapId, StringComparison.Ordinal), "Selected install keeps its map when UI selection changes");
                Directory.CreateDirectory(install.Addon);
                var target = Path.Combine(install.Addon, "pak01_dir.vpk");
                File.WriteAllText(target, "user file");
                using (install.Mount()) Check(File.ReadAllText(target) == "downloaded map", "Mounted file points to the selected Workshop map");
                Check(File.ReadAllText(target) == "user file" && !File.Exists(target + ".windymac-backup"), "Unmount restores the user's original file");
                var otherLibrary = Path.Combine(root, "external library");
                var otherGame = Path.Combine(otherLibrary, "steamapps/common/dota 2 beta/game");
                var otherExe = Path.Combine(otherGame, "bin/osx64/dota2.app/Contents/MacOS/dota2");
                Directory.CreateDirectory(Path.GetDirectoryName(otherExe)); File.WriteAllText(otherExe, "fixture");
                File.WriteAllText(Path.Combine(root, "steamapps/libraryfolders.vdf"), "\"libraryfolders\" { \"1\" { \"path\" \"" + otherLibrary + "\" } }");
                File.Delete(exe);
                var fromLibrary = MacInstall.FindIn(root, MacInstall.ReleaseMapId, true);
                Check(fromLibrary.Game == otherGame && fromLibrary.Vpk == map, "Game and Workshop map can live in separate Steam libraries");
                install.Vpk = Path.Combine(root, "missing.vpk");
                Throws(() => install.Mount(), "Missing source fails mounting");
                Check(File.ReadAllText(target) == "user file", "Failed mounting restores the user's original file");
            }
            finally { MacInstall.UseTestMap = false; Directory.Delete(root, true); }
            var urls = new List<string>();
            var version = Workshop.FetchLatestManifest(MacInstall.ReleaseMapId, url =>
            {
                urls.Add(url);
                if (urls.Count == 1) throw new IOException("offline direct route");
                return new Dictionary<string, object> { ["manifest"] = "123" };
            });
            Check(version == "123" && urls[0].StartsWith(LauncherApi.Direct, StringComparison.Ordinal) && urls[1].StartsWith(LauncherApi.Relay, StringComparison.Ordinal), "Version lookup falls back from Direct to Relay");
            Console.WriteLine("PASS Mac map detection, selection, mounting and version fallback");
        }

        static void Check(bool result, string message) { if (!result) throw new Exception(message); }
        static void Throws(Action action, string message)
        {
            try { action(); } catch (Exception) { return; }
            throw new Exception(message);
        }
    }
}
