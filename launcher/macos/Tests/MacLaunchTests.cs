namespace Windy10v10AI.Launcher
{
    static class MacLaunchTests
    {
        public static void RunAll()
        {
            const string installed = "/Applications/Steam.app/Contents/MacOS/steam_osx";
            var bundled = Path.Combine(MacInstall.SteamRoot, "Steam.AppBundle/Steam/Contents/MacOS/steam_osx");
            Check(MacInstall.FindSteamExecutable(path => path == installed || path == bundled) == bundled,
                "Prefer Steam runtime over the system bootstrap application");
            Check(MacInstall.FindSteamExecutable(path => path == bundled) == bundled,
                "Locate Steam's downloaded application bundle");
            Check(MacInstall.FindSteamExecutable(_ => false) == null,
                "Missing Steam executable allows protocol fallback");

            const string log = "/a path/game/dota/windymac-client-test.log";
            var launch = MacInstall.SteamLaunch(installed, log);
            Check(launch.FileName == installed && !launch.UseShellExecute,
                "Cold launch executes Steam without a shell");
            Check(launch.ArgumentList[0] == "-applaunch" && launch.ArgumentList[1] == "570",
                "Cold launch asks Steam to launch Dota");
            Check(launch.ArgumentList.Contains("windymac-client-test.log") &&
                !launch.ArgumentList.Contains(log), "Client logging uses a path relative to Dota");
            var fallback = MacInstall.SteamRunUrl(log);
            Check(fallback.StartsWith("steam://run/570//", StringComparison.Ordinal) &&
                fallback.EndsWith("/", StringComparison.Ordinal) &&
                !fallback.Contains(' '), "Protocol fallback escapes launch arguments");
            Check(Uri.UnescapeDataString(fallback["steam://run/570//".Length..^1]) ==
                string.Join(" ", MacInstall.ClientArguments(log)), "Both launch paths carry the same client arguments");
            Console.WriteLine("PASS Steam client launch command and fallback");
        }

        static void Check(bool result, string message)
        {
            if (!result) throw new Exception(message);
        }
    }
}
