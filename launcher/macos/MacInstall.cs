// GPL-3.0.
using System.Diagnostics;
using System.Text.RegularExpressions;
using System.Runtime.InteropServices;
namespace Windy10v10AI.Launcher
{
    sealed class MacInstall
    {
        public const string ReleaseMapId = "2307479570";
        public const string TestMapId = "2636824668";
        public static bool UseTestMap;
        public static string MapId => UseTestMap ? TestMapId : ReleaseMapId;
        public static readonly string SteamRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Library/Application Support/Steam");
        public string Library, Game, Exe, Vpk, Manifest;
        public string SelectedMapId = MapId;
        string workshopAcf;
        public string Addon => Path.Combine(Game, "dota_addons", SelectedMapId);
        public static string Value(string body, string key) => Regex.Match(body, "\"" + Regex.Escape(key) + @"""\s+""([^""]*)""").Groups[1].Value;
        public static long AccountId()
        {
            string file = Path.Combine(SteamRoot, "config/loginusers.vdf");
            try { return File.Exists(file) ? ReadAccountId(File.ReadAllText(file)) : 0; }
            catch (IOException) { return 0; }
        }
        internal static long ReadAccountId(string body)
        {
            var recent = new List<long>();
            var automatic = new List<long>();
            foreach (Match m in Regex.Matches(body, @"""(\d{17})""\s*\{([^}]*)\}"))
            {
                if (!long.TryParse(m.Groups[1].Value, out var id) || id <= 76561197960265728 || id > 76561202255233023) continue;
                var account = id - 76561197960265728;
                if (Value(m.Groups[2].Value, "MostRecent") == "1") recent.Add(account);
                if (Value(m.Groups[2].Value, "AutoLogin") == "1") automatic.Add(account);
            }
            // macOS 的 Steam 可不写最近使用标记，只在自动登录账号唯一时回退。
            return recent.Count == 1 ? recent[0] : recent.Count == 0 && automatic.Count == 1 ? automatic[0] : 0;
        }
        public static MacInstall Find() => Find(true);
        public static MacInstall Find(bool requireMap) => FindIn(SteamRoot, MapId, requireMap);
        internal static MacInstall FindIn(string steamRoot, string mapId, bool requireMap)
        {
            var libs = new List<string> { steamRoot };
            var vdf = Path.Combine(steamRoot, "steamapps/libraryfolders.vdf");
            if (File.Exists(vdf)) foreach (Match m in Regex.Matches(File.ReadAllText(vdf), @"""path""\s+""([^""]+)""")) libs.Add(m.Groups[1].Value.Replace("\\\\", "\\"));
            foreach (var lib in libs.Distinct())
            {
                var game = Path.Combine(lib, "steamapps/common/dota 2 beta/game");
                var exe = Path.Combine(game, "bin/osx64/dota2.app/Contents/MacOS/dota2");
                if (!File.Exists(exe)) continue;
                var workshopLib = libs.Distinct().FirstOrDefault(l => File.Exists(MapPath(l, mapId)));
                var install = new MacInstall { Library = lib, Game = game, Exe = exe, SelectedMapId = mapId };
                if (workshopLib != null)
                {
                    install.Vpk = MapPath(workshopLib, mapId);
                    install.workshopAcf = Path.Combine(workshopLib, "steamapps/workshop/appworkshop_570.acf");
                    install.Manifest = install.AcfBlocks().Select(block => Value(block, "manifest")).FirstOrDefault(value => !string.IsNullOrEmpty(value));
                }
                if (requireMap && install.Vpk == null) throw new Exception(Strings.NoMap);
                if (requireMap && string.IsNullOrEmpty(install.Manifest)) throw new Exception(Strings.MapVersionMissing);
                return install;
            }
            throw new Exception(Strings.NoDota);
        }
        static string MapPath(string library, string id) => Path.Combine(library, "steamapps/workshop/content/570", id, id + ".vpk");
        IEnumerable<string> AcfBlocks()
        {
            try
            {
                if (workshopAcf != null && File.Exists(workshopAcf))
                    return Regex.Matches(File.ReadAllText(workshopAcf), "\"" + Regex.Escape(SelectedMapId) + @"""\s*\{([^}]*)\}").Select(match => match.Groups[1].Value).ToArray();
            }
            catch (IOException) { }
            return Array.Empty<string>();
        }
        internal string MapState(string published)
        {
            if (Vpk == null || !File.Exists(Vpk)) return "missing";
            var blocks = AcfBlocks().ToArray();
            var manifests = blocks.Select(block => Value(block, "manifest")).Where(value => !string.IsNullOrEmpty(value)).ToArray();
            if (!string.IsNullOrEmpty(published) && manifests.Length > 0)
                return manifests.Any(value => value != published) ? "outdated" : "ready";
            long installed = 0, latest = 0;
            foreach (var block in blocks)
            {
                if (long.TryParse(Value(block, "timeupdated"), out var time)) installed = Math.Max(installed, time);
                if (long.TryParse(Value(block, "latest_timeupdated"), out time)) latest = Math.Max(latest, time);
            }
            return latest > installed ? "outdated" : "unknown";
        }
        [DllImport("libSystem.B.dylib", SetLastError = true)] static extern int link(string oldpath, string newpath);
        public IDisposable Mount() => new AddonMount(this);
        sealed class AddonMount : IDisposable
        {
            readonly string target, backup; readonly bool madeDirectory; bool mounted;
            public AddonMount(MacInstall i)
            {
                madeDirectory = !Directory.Exists(i.Addon); Directory.CreateDirectory(i.Addon);
                target = Path.Combine(i.Addon, "pak01_dir.vpk"); backup = target + ".windymac-backup";
                if (File.Exists(backup)) throw new Exception(string.Format(Strings.MapBackupFound, backup));
                if (File.Exists(target)) File.Move(target, backup);
                try { if (link(i.Vpk, target) != 0) File.Copy(i.Vpk, target); mounted = true; }
                catch { if (File.Exists(target)) File.Delete(target); if (File.Exists(backup)) File.Move(backup, target); if (madeDirectory && !Directory.EnumerateFileSystemEntries(i.Addon).Any()) Directory.Delete(i.Addon); throw; }
            }
            public void Dispose()
            {
                if (!mounted) return; mounted = false;
                File.Delete(target); if (File.Exists(backup)) File.Move(backup, target);
                var dir = Path.GetDirectoryName(target); if (madeDirectory && !Directory.EnumerateFileSystemEntries(dir).Any()) Directory.Delete(dir);
            }
        }
        public static bool ClientRunning()
        {
            var info = new ProcessStartInfo("/bin/ps") { RedirectStandardOutput = true, UseShellExecute = false };
            info.ArgumentList.Add("-axo"); info.ArgumentList.Add("comm=");
            using var p = Process.Start(info); var text = p.StandardOutput.ReadToEnd(); p.WaitForExit();
            return text.Split('\n').Any(l => l.Trim().EndsWith("/dota2.app/Contents/MacOS/dota2", StringComparison.Ordinal));
        }
        internal static bool IsShuttingDownLog(string text)
        {
            int exit = Math.Max(text.LastIndexOf("MainLoop returning", StringComparison.Ordinal), text.LastIndexOf("Source2Shutdown", StringComparison.Ordinal));
            return exit >= 0 && exit > text.LastIndexOf("Source2Init OK", StringComparison.Ordinal);
        }
        bool ClientExiting()
        {
            var info = new ProcessStartInfo("/bin/ps") { RedirectStandardOutput = true, UseShellExecute = false };
            info.ArgumentList.Add("-axo"); info.ArgumentList.Add("command=");
            using var process = Process.Start(info); var commands = process.StandardOutput.ReadToEnd(); process.WaitForExit();
            foreach (var line in commands.Split('\n'))
            {
                if (!line.TrimStart().StartsWith(Exe, StringComparison.Ordinal)) continue;
                var match = Regex.Match(line, @"-con_logfile\s+([^\s]+)");
                if (!match.Success) continue;
                var file = Path.Combine(Game, "dota", match.Groups[1].Value);
                try { if (File.Exists(file) && IsShuttingDownLog(File.ReadAllText(file))) return true; } catch { }
            }
            return false;
        }
        public async Task EnterClient(Action<string> info, CancellationToken ct)
        {
            string clientLog = null;
            bool existing = ClientRunning();
            if (existing && ClientExiting()) throw new Exception("Dota 2 的窗口已关闭，但进程仍在退出。请等待退出完成后重试；启动器不会重复启动客户端。");
            if (existing) info("检测到 Dota 2 开着，正在连接房间…");
            if (!existing)
            {
                clientLog = await StartClient(ct);
                info("正在启动 Dota 2，等待主菜单加载完成后自动连接房间…");
                await WaitForDashboard(clientLog, ct);
            }
            ct.ThrowIfCancellationRequested();
            await OpenSteamUrl("steam://connect/127.0.0.1:27016", ct);
            info("已向 Dota 发送连接请求，等待服务器确认进图。");
            if (clientLog != null) _ = Task.Run(() => ArchiveClientLog(clientLog));
        }
        internal static string FindSteamExecutable(Func<string, bool> exists)
        {
            var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            return new[] {
                Path.Combine(SteamRoot,"Steam.AppBundle/Steam/Contents/MacOS/steam_osx"),
                "/Applications/Steam.app/Contents/MacOS/steam_osx",
                Path.Combine(home,"Applications/Steam.app/Contents/MacOS/steam_osx")
            }.FirstOrDefault(exists);
        }
        internal static string[] ClientArguments(string clientLog) => new[] {
            "-novid","-con_logfile",Path.GetFileName(clientLog),"+con_enable","1",
            "+fs_async_threads","16","+fs_async_threads"
        };
        internal static ProcessStartInfo SteamLaunch(string steam, string clientLog)
        {
            var launch = new ProcessStartInfo(steam) { UseShellExecute = false };
            launch.ArgumentList.Add("-applaunch");
            launch.ArgumentList.Add("570");
            foreach (var argument in ClientArguments(clientLog)) launch.ArgumentList.Add(argument);
            return launch;
        }
        internal static string SteamRunUrl(string clientLog) => "steam://run/570//" +
            Uri.EscapeDataString(string.Join(" ", ClientArguments(clientLog))) + "/";
        async Task<string> StartClient(CancellationToken ct)
        {
            ct.ThrowIfCancellationRequested();
            var clientLog = Path.Combine(Game, "dota", "windymac-client-" + Guid.NewGuid().ToString("N") + ".log");
            var steam = FindSteamExecutable(File.Exists);
            if (steam != null)
            {
                try
                {
                    using var process = Process.Start(SteamLaunch(steam, clientLog));
                    if (process != null) return clientLog;
                }
                catch (System.ComponentModel.Win32Exception) { }
            }
            // 客户端会话必须由 Steam 创建。
            await OpenSteamUrl(SteamRunUrl(clientLog), ct);
            return clientLog;
        }
        static async Task WaitForDashboard(string clientLog, CancellationToken ct)
        {
            bool ready = false; var deadline = DateTime.UtcNow.AddMinutes(6);
            while (DateTime.UtcNow < deadline)
            {
                ct.ThrowIfCancellationRequested();
                if (File.Exists(clientLog))
                {
                    var text = File.ReadAllText(clientLog);
                    if (text.Contains("DOTA_GAME_UI_STATE_LOADING_SCREEN -> DOTA_GAME_UI_STATE_DASHBOARD") && text.Contains("OnSwitchLoopModeFinished( game : success )")) { ready = true; break; }
                }
                await Task.Delay(1000, ct);
            }
            if (!ready) throw new Exception("等待 Dota 主菜单超时。请查看客户端日志，进入主菜单后再点进入游戏。");
            await Task.Delay(5000, ct);
        }
        static async Task ArchiveClientLog(string clientLog)
        {
            try
            {
                Directory.CreateDirectory(HostSession.Logs);
                var archive = Path.Combine(HostSession.Logs, Path.GetFileName(clientLog));
                do { await Task.Delay(3000); File.Copy(clientLog, archive, true); } while (ClientRunning());
                File.Delete(clientLog);
            }
            catch { }
        }
        internal static async Task OpenSteamUrl(string url, CancellationToken ct)
        {
            var pi = new ProcessStartInfo("/usr/bin/open") { UseShellExecute = false, RedirectStandardError = true }; pi.ArgumentList.Add(url);
            using var process = Process.Start(pi);
            var error = process.StandardError.ReadToEndAsync(); await process.WaitForExitAsync(ct);
            if (process.ExitCode != 0) throw new Exception("无法交给 Steam 处理：" + await error);
        }
        public static Task VerifyFiles(CancellationToken ct) => OpenSteamUrl("steam://validate/570", ct);
        public static Task SubscribeMap(CancellationToken ct) => OpenSteamUrl("steam://url/CommunityFilePage/" + MapId, ct);
        public Dictionary<string, object> Inspect(Func<string, string> latest = null)
        {
            var published = Vpk == null ? null : (latest ?? Workshop.LatestManifest)(SelectedMapId);
            return new() { ["installed"] = true, ["mapState"] = MapState(published), ["mapVersion"] = Manifest ?? "", ["accountDetected"] = AccountId() > 0, ["gamePath"] = Game, ["mapPath"] = Vpk ?? "", ["testMap"] = SelectedMapId == TestMapId };
        }
    }
}
