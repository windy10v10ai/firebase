// GPL-3.0.
using System.Text.Json;
using System.Globalization;
namespace Windy10v10AI.Launcher
{
    static class Program
    {
        static readonly object output = new();
        public static void Emit(object value) { lock (output) Console.WriteLine(JsonSerializer.Serialize(value)); }
        public static async Task<int> Main(string[] args)
        {
            var languageAt = Array.IndexOf(args, "--language");
            if (languageAt >= 0 && languageAt + 1 < args.Length)
            {
                CultureInfo.CurrentUICulture = CultureInfo.GetCultureInfo(args[languageAt + 1]);
                CultureInfo.CurrentCulture = CultureInfo.CurrentUICulture;
                args = args.Where((_, index) => index != languageAt && index != languageAt + 1).ToArray();
            }
            var result = await RunCommandLine(args);
            return result ?? await new NativeBridge().Run();
        }
        static async Task<int?> RunCommandLine(string[] args)
        {
            if (args.Length == 2 && args[0] == "--strings") return SharedStrings.Export(args[1]);
#if LAUNCHER_TESTS
            if (args.Length == 2 && args[0] == "--join-room-test") return await Tests.LiveJoinRoomTest.Run(args[1]);
            if (args.Contains("--self-test")) return await IntegrationTests.Run();
            if (args.Contains("--transport-test")) return await IntegrationTests.Transport();
            if (args.Contains("--live-test")) return await IntegrationTests.Live(args.Contains("--enter-client"));
#endif
            if (args.Contains("--inspect")) return Inspect();
            return null;
        }
        static int Inspect()
        {
            try { Emit(MacInstall.Find().Inspect()); return 0; } catch (Exception e) { Emit(new { error = e.Message }); return 1; }
        }
    }
}
