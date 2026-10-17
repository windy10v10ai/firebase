// GPL-3.0.
using System.Diagnostics;
using System.Text.RegularExpressions;
using System.Runtime.InteropServices;
namespace Windy10v10AI.Launcher {
    sealed class MacInstall {
        public const string MapId="2307479570";
        public static readonly string SteamRoot=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),"Library/Application Support/Steam");
        public string Library, Game, Exe, Vpk, Manifest;
        public string Addon => Path.Combine(Game,"dota_addons",MapId);
        public static string Value(string body,string key) => Regex.Match(body,"\""+Regex.Escape(key)+"\"\\s+\"([^\"]*)\"").Groups[1].Value;
        public static long AccountId() {
            // 账号识别只需读取 Steam 的登录标记，无需访问凭据。
            string file=Path.Combine(SteamRoot,"config/loginusers.vdf");
            if (!File.Exists(file)) return 0;
            foreach(Match m in Regex.Matches(File.ReadAllText(file),"\"(\\d{17})\"\\s*\\{([^}]*)\\}")) {
                if(Value(m.Groups[2].Value,"MostRecent")=="1" || Value(m.Groups[2].Value,"AutoLogin")=="1") return long.Parse(m.Groups[1].Value)-76561197960265728;
            }
            return 0;
        }
        public static MacInstall Find() {
            var libs=new List<string>{SteamRoot};
            var vdf=Path.Combine(SteamRoot,"steamapps/libraryfolders.vdf");
            if(File.Exists(vdf)) foreach(Match m in Regex.Matches(File.ReadAllText(vdf),"\"path\"\\s+\"([^\"]+)\"")) libs.Add(m.Groups[1].Value.Replace("\\\\","\\"));
            foreach(var lib in libs.Distinct()) {
                var game=Path.Combine(lib,"steamapps/common/dota 2 beta/game");
                var exe=Path.Combine(game,"bin/osx64/dota2.app/Contents/MacOS/dota2");
                if(!File.Exists(exe))continue;
                var vpk=libs.Distinct().Select(l=>Path.Combine(l,"steamapps/workshop/content/570",MapId,MapId+".vpk")).FirstOrDefault(File.Exists);
                if(vpk==null) throw new Exception("已找到 Dota 2，但没有 10v10 地图。请先在 Steam 订阅并下载地图。");
                var workshopLib=libs.Distinct().First(l=>vpk.StartsWith(Path.Combine(l,"steamapps/workshop/content")));
                var acf=Path.Combine(workshopLib,"steamapps/workshop/appworkshop_570.acf");
                string manifest=null;
                if(File.Exists(acf)) {
                    var block=Regex.Match(File.ReadAllText(acf),"\""+MapId+"\"\\s*\\{([^}]*)\\}");
                    manifest=Value(block.Groups[1].Value,"manifest");
                }
                if(string.IsNullOrEmpty(manifest))throw new Exception("无法读取地图版本，请先让 Steam 完成地图下载。");
                return new MacInstall {Library=lib,Game=game,Exe=exe,Vpk=vpk,Manifest=manifest};
            }
            throw new Exception("未找到 Mac 版 Dota 2，请先通过 Steam 安装游戏。");
        }
        [DllImport("libSystem.B.dylib",SetLastError=true)] static extern int link(string oldpath,string newpath);
        public IDisposable Mount() => new AddonMount(this);
        sealed class AddonMount:IDisposable {
            readonly string target,backup; readonly bool madeDirectory; bool mounted;
            public AddonMount(MacInstall i) {
                madeDirectory=!Directory.Exists(i.Addon);Directory.CreateDirectory(i.Addon);
                target=Path.Combine(i.Addon,"pak01_dir.vpk");backup=target+".windymac-backup";
                if(File.Exists(backup))throw new Exception("发现上次遗留的地图备份，请检查日志并恢复后重试："+backup);
                if(File.Exists(target))File.Move(target,backup);
                try { if(link(i.Vpk,target)!=0)File.Copy(i.Vpk,target);mounted=true; }
                catch { if(File.Exists(backup))File.Move(backup,target);throw; }
            }
            public void Dispose() {
                if(!mounted)return;mounted=false;
                File.Delete(target);if(File.Exists(backup))File.Move(backup,target);
                var dir=Path.GetDirectoryName(target);if(madeDirectory&&!Directory.EnumerateFileSystemEntries(dir).Any())Directory.Delete(dir);
            }
        }
        public static bool ClientRunning() {
            var info=new ProcessStartInfo("/bin/ps"){RedirectStandardOutput=true,UseShellExecute=false};
            info.ArgumentList.Add("-axo");info.ArgumentList.Add("comm=");
            using var p=Process.Start(info);var text=p.StandardOutput.ReadToEnd();p.WaitForExit();
            return text.Split('\n').Any(l=>l.Trim().EndsWith("/dota2.app/Contents/MacOS/dota2",StringComparison.Ordinal));
        }
        internal static bool IsShuttingDownLog(string text) {
            int exit=Math.Max(text.LastIndexOf("MainLoop returning",StringComparison.Ordinal),text.LastIndexOf("Source2Shutdown",StringComparison.Ordinal));
            return exit>=0&&exit>text.LastIndexOf("Source2Init OK",StringComparison.Ordinal);
        }
        bool ClientExiting() {
            var info=new ProcessStartInfo("/bin/ps"){RedirectStandardOutput=true,UseShellExecute=false};
            info.ArgumentList.Add("-axo");info.ArgumentList.Add("command=");
            using var process=Process.Start(info);var commands=process.StandardOutput.ReadToEnd();process.WaitForExit();
            foreach(var line in commands.Split('\n')) {
                if(!line.TrimStart().StartsWith(Exe,StringComparison.Ordinal))continue;
                var match=Regex.Match(line,@"-con_logfile\s+([^\s]+)");
                if(!match.Success)continue;
                var file=Path.Combine(Game,"dota",match.Groups[1].Value);
                try {if(File.Exists(file)&&IsShuttingDownLog(File.ReadAllText(file)))return true;}catch{}
            }
            return false;
        }
        public async Task EnterClient(Action<string> info,CancellationToken ct) {
            var steam=Path.Combine(SteamRoot,"Steam.AppBundle/Steam/Contents/MacOS/steam_osx");
            if(!File.Exists(steam))throw new Exception("找不到 Steam 客户端。");
            string clientLog=null;
            bool existing=ClientRunning();
            if(existing&&ClientExiting())throw new Exception("Dota 2 的窗口已关闭，但进程仍在退出。请等待退出完成后重试；启动器不会重复启动客户端。");
            if(existing)info("检测到 Dota 2 开着，正在连接房间…");
            if(!existing) {
                clientLog=StartClient();
                info("正在启动 Dota 2，等待主菜单加载完成后自动连接房间…");
                await WaitForDashboard(clientLog,ct);
            }
            ct.ThrowIfCancellationRequested();
            await OpenSteamUrl("steam://connect/127.0.0.1:27016",ct);
            info("已向 Dota 发送连接请求，等待服务器确认进图。");
            if(clientLog!=null)_=Task.Run(()=>ArchiveClientLog(clientLog));
        }
        string StartClient() {
            var clientLog=Path.Combine(Game,"dota","windymac-client-"+Guid.NewGuid().ToString("N")+".log");
            // 游戏自带的启动脚本负责设置库路径和资源限制。
            // 客户端独立持有日志流，避免启动器退出时破坏管道。
            var script=Path.Combine(Game,"dota.sh");
            if(!File.Exists(script))throw new Exception("未找到游戏自带的 dota.sh 启动脚本。");
            Directory.CreateDirectory(HostSession.Logs);
            var launch=new ProcessStartInfo("/bin/bash"){WorkingDirectory=Game,UseShellExecute=false};
            foreach(var argument in new[]{"-c","exec /bin/bash \"$@\" >\"$WINDYMAC_CLIENT_LOG\" 2>&1 </dev/null","windymac",script,"-novid","-con_logfile",Path.GetFileName(clientLog),"+con_enable","1","+fs_async_threads","16","+fs_async_threads"})launch.ArgumentList.Add(argument);
            launch.Environment["SteamAppId"]="570";launch.Environment["SteamGameId"]="570";
            launch.Environment["WINDYMAC_CLIENT_LOG"]=Path.Combine(HostSession.Logs,"client-start-"+DateTime.Now.ToString("yyyyMMdd-HHmmss")+".log");
            Process.Start(launch)?.Dispose();
            return clientLog;
        }
        static async Task WaitForDashboard(string clientLog,CancellationToken ct) {
            bool ready=false;var deadline=DateTime.UtcNow.AddMinutes(6);
            while(DateTime.UtcNow<deadline) {
                ct.ThrowIfCancellationRequested();
                if(File.Exists(clientLog)) {
                    var text=File.ReadAllText(clientLog);
                    if(text.Contains("DOTA_GAME_UI_STATE_LOADING_SCREEN -> DOTA_GAME_UI_STATE_DASHBOARD")&&text.Contains("OnSwitchLoopModeFinished( game : success )")){ready=true;break;}
                }
                await Task.Delay(1000,ct);
            }
            if(!ready)throw new Exception("等待 Dota 主菜单超时。请查看客户端日志，进入主菜单后再点进入游戏。");
            await Task.Delay(5000,ct);
        }
        static async Task ArchiveClientLog(string clientLog) {
            try {
                Directory.CreateDirectory(HostSession.Logs);
                var archive=Path.Combine(HostSession.Logs,Path.GetFileName(clientLog));
                do {await Task.Delay(3000);File.Copy(clientLog,archive,true);}while(ClientRunning());
                File.Delete(clientLog);
            }catch{}
        }
        static async Task OpenSteamUrl(string url,CancellationToken ct) {
            var pi=new ProcessStartInfo("/usr/bin/open"){UseShellExecute=false,RedirectStandardError=true};pi.ArgumentList.Add(url);
            using var process=Process.Start(pi);
            var error=process.StandardError.ReadToEndAsync();await process.WaitForExitAsync(ct);
            if(process.ExitCode!=0)throw new Exception("无法交给 Steam 处理："+await error);
        }
        public Dictionary<string,object> Inspect() => new() { ["installed"]=true,["mapVersion"]=Manifest,["accountDetected"]=AccountId()>0,["gamePath"]=Game,["mapPath"]=Vpk };
    }
}
