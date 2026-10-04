using System;
using System.Globalization;
using System.IO;

namespace Windy10v10AI.Launcher.Tests
{
    static class SteamExecutableTests
    {
        static int Main(string[] args)
        {
            try
            {
                var culture = args.Length == 0 ? "zh-CN" : args[0];
                CultureInfo.CurrentUICulture = new CultureInfo(culture);
                SteamClientMissingIsActionable(culture);
                UsesRegisteredExecutable();
                UsesSteamWhenRegisteredExecutableIsMissing();
                UsesSteamChinaWhenSteamIsMissing();
                ReturnsNullWhenClientsAreMissing();
                Console.WriteLine("PASS Steam executable tests (" + culture + ")");
                return 0;
            }
            catch (Exception error)
            {
                Console.Error.WriteLine("FAIL " + error.Message);
                return 1;
            }
        }

        static void SteamClientMissingIsActionable(string culture)
        {
            var expected = culture == "zh-CN"
                ? "找不到 Steam 客户端。请打开 Steam 或蒸汽平台并等待更新完成，再重新开局。"
                : culture == "ru-RU"
                    ? "Steam не найден. Откройте Steam, дождитесь завершения обновления и попробуйте снова."
                    : "Steam could not be found. Open Steam and wait for it to finish updating, then try again.";
            Equal(expected, Strings.SteamClientMissing, "shows an actionable Steam client error");
        }

        static void UsesRegisteredExecutable()
        {
            WithTempDirectory(root =>
            {
                var registered = Path.Combine(root, "registered-steam.exe");
                var steamChina = Path.Combine(root, "steamchina.exe");
                File.WriteAllText(registered, "");
                File.WriteAllText(steamChina, "");
                Equal(registered, Resolve(registered, root), "uses the executable registered by Steam");
            });
        }

        static void UsesSteamWhenRegisteredExecutableIsMissing()
        {
            WithTempDirectory(root =>
            {
                var steam = Path.Combine(root, "steam.exe");
                File.WriteAllText(steam, "");
                Equal(steam, Resolve(Path.Combine(root, "missing.exe"), root), "falls back to steam.exe");
            });
        }

        static void UsesSteamChinaWhenSteamIsMissing()
        {
            WithTempDirectory(root =>
            {
                var steamChina = Path.Combine(root, "steamchina.exe");
                File.WriteAllText(steamChina, "");
                Equal(steamChina, Resolve(null, root), "uses steamchina.exe when steam.exe is missing");
            });
        }

        static void ReturnsNullWhenClientsAreMissing()
        {
            WithTempDirectory(root => Equal(null, Resolve(null, root), "returns null without a Steam client"));
        }

        static string Resolve(string registeredExe, string steamPath)
        {
            return DotaInstall.FindSteamExecutable(registeredExe, steamPath);
        }

        static void WithTempDirectory(Action<string> test)
        {
            var path = Path.Combine(Path.GetTempPath(), "Windy10v10AI-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(path);
            try
            {
                test(path);
            }
            finally
            {
                Directory.Delete(path, true);
            }
        }

        static void Equal(string expected, string actual, string name)
        {
            if (!string.Equals(expected, actual, StringComparison.OrdinalIgnoreCase))
            {
                throw new Exception(name + ": expected " + (expected ?? "null") + ", got " + (actual ?? "null"));
            }
        }
    }
}
