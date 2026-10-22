// GPL-3.0.
using System.Diagnostics;
namespace Windy10v10AI.Launcher
{
    static class Workshop
    {
        static readonly Dictionary<string, (DateTime Until, string Manifest)> versions = new();

        public static string LatestManifest(string id)
        {
            lock (versions)
            {
                if (versions.TryGetValue(id, out var cached) && cached.Until > DateTime.UtcNow) return cached.Manifest;
            }
            var manifest = FetchLatestManifest(id, url => Http.Json(url, null, url.StartsWith(LauncherApi.Relay, StringComparison.Ordinal) ? 8000 : 4000));
            lock (versions) versions[id] = (DateTime.UtcNow.AddMinutes(manifest == null ? 5 : 30), manifest);
            return manifest;
        }

        internal static string FetchLatestManifest(string id, Func<string, Dictionary<string, object>> fetch)
        {
            foreach (var root in new[] { LauncherApi.Direct, LauncherApi.Relay })
            {
                try
                {
                    var body = fetch(root + "workshop/" + id);
                    if (body.TryGetValue("manifest", out var value) && !string.IsNullOrEmpty(Convert.ToString(value)))
                        return Convert.ToString(value);
                }
                catch (Exception) { }
            }
            return null;
        }

        public static async Task Update(Action<object> emit, CancellationToken ct)
        {
            var id = MacInstall.MapId;
            try
            {
                emit(new { type = "state", state = "updating", message = Strings.MapUpdating, code = "", log = "" });
                var install = MacInstall.Find(false);
                var helper = Environment.GetEnvironmentVariable("WINDY_WORKSHOP_HELPER") ?? Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../MacOS/WorkshopUpdate"));
                if (!File.Exists(helper)) throw new Exception(Strings.MapUpdateHelperMissing);
                var pi = new ProcessStartInfo(helper) { UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true };
                pi.ArgumentList.Add(Path.Combine(install.Game, "bin/osx64/libsteam_api.dylib")); pi.ArgumentList.Add(id);
                using var p = Process.Start(pi);
                // 库诊断可能包含 Steam 身份信息，不能写入界面通信流。
                var stdout = p.StandardOutput.ReadToEndAsync(); var stderr = p.StandardError.ReadToEndAsync();
                using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct); timeout.CancelAfter(TimeSpan.FromMinutes(11));
                try { await p.WaitForExitAsync(timeout.Token); } catch { if (!p.HasExited) p.Kill(); throw; }
                await stdout; await stderr;
                if (p.ExitCode != 0) throw new Exception(Strings.MapUpdateFailed);
                lock (versions) versions.Remove(id);
                // Steam 异步释放辅助进程的游戏会话，启动客户端前需留出时间。
                await Task.Delay(5000, ct);
                emit(new { type = "state", state = "idle", message = Strings.MapUpdateComplete, code = "", log = "" });
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                emit(new { type = "state", state = "idle", message = Strings.MapUpdateStopped, code = "", log = "" });
            }
            catch (Exception e) { emit(new { type = "state", state = "error", message = e is OperationCanceledException ? Strings.MapUpdateFailed : e.Message, code = "", log = "" }); }
        }
    }
}
