using System.IO.Compression;
namespace Windy10v10AI.Launcher.Tests
{
    static class MacServiceTests
    {
        public static void RunAll()
        {
            var data = new Dictionary<string, object> { ["version"] = "9.0.0", ["sha256"] = new string('a', 64) };
            if (MacUpdater.ReadRelease(data, "https://example.invalid/", "0.6.3") != null) throw new Exception("Windows release accepted on Mac");
            data["platform"] = "macos";
            if (MacUpdater.ReadRelease(data, "https://example.invalid/", "0.6.3") == null) throw new Exception("Mac release rejected");
            if (MacUpdater.ReadRelease(data, "https://example.invalid/", "9.0.0") != null) throw new Exception("same version offered");
            data["sha256"] = "invalid";
            if (MacUpdater.ReadRelease(data, "https://example.invalid/", "0.6.3") != null) throw new Exception("invalid hash accepted");
            var folder = Path.Combine(Path.GetTempPath(), "windy-service-tests-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(folder);
            try
            {
                var zip = Path.Combine(folder, "update.zip");
                using (var archive = ZipFile.Open(zip, ZipArchiveMode.Create)) archive.CreateEntry("Windy10v10AI.app/Contents/Info.plist");
                MacUpdater.ValidateArchive(zip);
                using (var archive = ZipFile.Open(zip, ZipArchiveMode.Update)) archive.CreateEntry("Windy10v10AI.app/../../escape");
                try { MacUpdater.ValidateArchive(zip); throw new Exception("archive traversal accepted"); } catch (InvalidDataException) { }
                var body = FeedbackApi.BuildBody(new FeedbackDraft { Type = "problem", Context = new FeedbackContext { LauncherVersion = LauncherVersion.Current, Mode = 0 } });
                if (body.ContainsKey("serverLog") || body.ContainsKey("clientLog")) throw new Exception("logs attached without consent");
                try { MacFeedback.Draft(new Dictionary<string, object> { { "kind", "suggestion" }, { "description", "" } }, null, null); throw new Exception("empty suggestion accepted"); } catch (ArgumentException) { }
            }
            finally { Directory.Delete(folder, true); }
            Console.WriteLine("PASS Mac release isolation, update archive and feedback consent");
        }
    }
}
