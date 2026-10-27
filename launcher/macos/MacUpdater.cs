using System.Diagnostics;
using System.IO.Compression;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;

namespace Windy10v10AI.Launcher
{
    sealed class MacRelease
    {
        public string Version;
        public string Sha256;
        public string Api;
    }

    static class MacUpdater
    {
        public const string DownloadPage = "https://windy10v10ai.com/launch";
        [DllImport("libSystem.B.dylib")]
        static extern int getppid();

        // 本地联调时指向本机的 API，只走这一条线路
        static string LocalApi()
        {
            var local = Environment.GetEnvironmentVariable("WINDY_API");
            return string.IsNullOrEmpty(local) ? null : local.TrimEnd('/') + "/api/launcher/";
        }

        internal static string[] Routes(string first)
        {
            var local = LocalApi();
            if (local != null) return new[] { local };
            return new[] { first, first == LauncherApi.Direct ? LauncherApi.Relay : LauncherApi.Direct };
        }

        public static MacRelease FindNewer()
        {
            foreach (var api in Routes(LauncherApi.Direct))
            {
                try
                {
                    var data = Http.Json(api + "version?platform=macos", null, api == LauncherApi.Direct ? 4000 : 8000);
                    var release = ReadRelease(data, api, LauncherVersion.Current);
                    if (release != null) return release;
                }
                catch { }
            }
            return null;
        }

        internal static MacRelease ReadRelease(Dictionary<string, object> data, string api, string current)
        {
            var version = Convert.ToString(data.GetValueOrDefault("version"));
            var sha = Convert.ToString(data.GetValueOrDefault("sha256"));
            if (Convert.ToString(data.GetValueOrDefault("platform")) != "macos") return null;
            if (!Version.TryParse(version, out var next) || next <= new Version(current)) return null;
            if (sha.Length != 64 || sha.Any(c => !Uri.IsHexDigit(c))) return null;
            return new MacRelease { Version = version, Sha256 = sha, Api = api };
        }

        public static async Task Install(MacRelease release)
        {
            if (release == null) throw new InvalidOperationException(Strings.UpdateFailed);
            var resources = Directory.GetParent(AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar));
            var contents = resources?.Parent;
            var app = contents?.Parent?.FullName;
            if (app == null || !app.EndsWith(".app", StringComparison.Ordinal)) throw new InvalidOperationException(Strings.UpdateFailed);
            if (Directory.Exists(app + ".windy-old") || File.Exists(app + ".windy-old")) throw new InvalidOperationException(Strings.UpdateFailed);
            var parent = Directory.GetParent(app)?.FullName ?? throw new InvalidOperationException(Strings.UpdateFailed);
            using (var probe = new FileStream(Path.Combine(parent, ".windy-write-" + Guid.NewGuid().ToString("N")), FileMode.CreateNew, FileAccess.Write, FileShare.None, 1, FileOptions.DeleteOnClose)) { }
            var stage = Path.Combine(Path.GetTempPath(), "windy-update-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(stage);
            bool scheduled = false;
            try
            {
                var zip = Path.Combine(stage, "update.zip");
                byte[] bytes = null;
                foreach (var api in Routes(release.Api))
                {
                    try
                    {
                        var candidate = await Task.Run(() => Http.Bytes(api + "download/" + Uri.EscapeDataString(release.Version) + "?platform=macos", 120000));
                        if (Convert.ToHexString(SHA256.HashData(candidate)).Equals(release.Sha256, StringComparison.OrdinalIgnoreCase)) { bytes = candidate; break; }
                    }
                    catch { }
                }
                if (bytes == null) throw new InvalidOperationException(Strings.UpdateFailed);
                await File.WriteAllBytesAsync(zip, bytes);
                ValidateArchive(zip);
                var unpacked = Path.Combine(stage, "unpacked");
                await Run("/usr/bin/ditto", "-x", "-k", zip, unpacked);
                var fresh = Path.Combine(unpacked, "Windy10v10AI.app");
                await Run("/usr/bin/codesign", "--verify", "--deep", "--strict", fresh);
                var versionInfo = new ProcessStartInfo("/usr/libexec/PlistBuddy") { RedirectStandardOutput = true, UseShellExecute = false };
                versionInfo.ArgumentList.Add("-c"); versionInfo.ArgumentList.Add("Print :CFBundleShortVersionString"); versionInfo.ArgumentList.Add(Path.Combine(fresh, "Contents", "Info.plist"));
                using (var process = Process.Start(versionInfo))
                {
                    var version = (await process.StandardOutput.ReadToEndAsync()).Trim();
                    await process.WaitForExitAsync();
                    if (process.ExitCode != 0 || version != release.Version) throw new InvalidOperationException(Strings.UpdateFailed);
                }
                var script = Path.Combine(stage, "install.sh");
                await File.WriteAllTextAsync(script, """
                    #!/bin/sh
                    while kill -0 "$1" 2>/dev/null || kill -0 "$2" 2>/dev/null; do sleep 0.2; done
                    backup="$3.windy-old"
                    if [ -e "$backup" ]; then /usr/bin/open "$3"; exit 1; fi
                    if ! mv "$3" "$backup"; then /usr/bin/open "$3"; exit 1; fi
                    if mv "$4" "$3"; then
                        if /usr/bin/open "$3"; then rm -rf "$backup" "$5"; exit 0; fi
                        mv "$3" "$4"
                    fi
                    mv "$backup" "$3"
                    /usr/bin/open "$3"
                    """);
                var start = new ProcessStartInfo("/bin/sh") { UseShellExecute = false };
                foreach (var argument in new[] { script, Environment.ProcessId.ToString(), getppid().ToString(), app, fresh, stage }) start.ArgumentList.Add(argument);
                using var installer = Process.Start(start) ?? throw new InvalidOperationException(Strings.UpdateFailed);
                scheduled = true;
            }
            finally { if (!scheduled) Directory.Delete(stage, true); }
        }

        internal static void ValidateArchive(string path)
        {
            using var zip = ZipFile.OpenRead(path);
            foreach (var entry in zip.Entries)
            {
                var name = entry.FullName;
                if (name.Split('/').Any(part => part == "..") || name.Contains('\\')) throw new InvalidDataException(Strings.UpdateFailed);
                if (name.StartsWith("__MACOSX/", StringComparison.Ordinal)) continue;
                if (!(name == "Windy10v10AI.app/" || name.StartsWith("Windy10v10AI.app/", StringComparison.Ordinal)))
                    throw new InvalidDataException(Strings.UpdateFailed);
            }
            if (zip.GetEntry("Windy10v10AI.app/Contents/Info.plist") == null) throw new InvalidDataException(Strings.UpdateFailed);
        }

        static async Task Run(string command, params string[] arguments)
        {
            var start = new ProcessStartInfo(command) { UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true };
            foreach (var argument in arguments) start.ArgumentList.Add(argument);
            using var process = Process.Start(start);
            var stdout = process.StandardOutput.ReadToEndAsync();
            var stderr = process.StandardError.ReadToEndAsync();
            await process.WaitForExitAsync(); await stdout; await stderr;
            if (process.ExitCode != 0) throw new InvalidOperationException(Strings.UpdateFailed);
        }
    }
}
