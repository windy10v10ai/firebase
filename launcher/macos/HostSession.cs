// GPL-3.0.
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text.RegularExpressions;
namespace Windy10v10AI.Launcher {
    sealed class HostSession {
        public static readonly string Logs=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),"Library/Logs/WindyMac");
        public HostRoster Roster {get;private set;}=new();
        public HostTunnel Tunnel {get;private set;}
        public string Code {get;private set;}
        public string Manifest {get;private set;}
        public string State {get;private set;}="idle";
        public bool Ready {get;private set;}
        public bool Active {get{lock(runLock)return worker!=null&&!worker.IsCompleted;}}
        public bool HostInGame=>Roster.InGame("host");
        public string ServerLog {get;private set;}
        readonly Action<object> emit;
        readonly object logLock=new(),runLock=new();
        CancellationTokenSource cancel;
        Task worker;
        Process server;
        LocalGate gate;
        RosterServer rosterServer;
        IDisposable mount;
        DedicatedBundle dedicated;
        Task entering=Task.CompletedTask;
        MacInstall install;
        Dictionary<string,object> body;
        string token,mode;
        int maxPlayers,game;
        bool started,ended,saved;
        DateTime? endedAt;
        DateTime readyAt;
        bool autoEnter;
        StreamWriter log;
        string consolePath,consolePending="";StreamReader consoleReader;
        ClientSignon signon=new();
        public bool LocalTestSkipLatestCheck {get;init;}
        readonly ConcurrentQueue<Dictionary<string,object>> results=new();
        readonly ConcurrentQueue<string> next=new();
        readonly HashSet<string> seen=new();
        List<RelayLeg> relays=new();
        public HostSession(Action<object> emit) {this.emit=emit;}
        void Event(string state,string message) {State=state;emit(new{type="state",state,message,code=Code??"",log=ServerLog??"",game});}
        void Info(string message) => emit(new{type="message",message});
        public void Start(string difficulty,int count,bool enter) {
            if(!new[]{"easy","hard","custom"}.Contains(difficulty))throw new Exception("难度无效。");
            if(count<2||count>10)throw new Exception("人数须为 2–10 人。");
            lock(runLock) {
                if(worker!=null&&!worker.IsCompleted)throw new Exception("已有房间正在运行。");
                cancel=new CancellationTokenSource();mode=difficulty;maxPlayers=count;autoEnter=enter;
                worker=Task.Run(()=>Run(cancel.Token));
            }
        }
        public async Task Stop() {
            Task current;lock(runLock) {cancel?.Cancel();current=worker;}
            if(current!=null)await current;
        }
        public void Enter() {
            if(!Ready||ended)throw new Exception("请等待服务器准备好后再进入。");
            if(!entering.IsCompleted)return;
            entering=Task.Run(async()=>{try{await install.EnterClient(Info,cancel.Token);}catch(OperationCanceledException){}catch(Exception e){Info("进入失败："+e.Message);}});
        }
        public void Next(string difficulty) {
            if(!new[]{"easy","hard","custom"}.Contains(difficulty))throw new Exception("难度无效。");
            if(!saved)throw new Exception("请等待本局结束并保存结算。");
            if(!next.IsEmpty) return;
            next.Enqueue(difficulty);
        }
        Dictionary<string,object> HostBody() {
            var d=new Dictionary<string,object>(body) {
                ["public"]=false,["maxPlayers"]=maxPlayers,["map"]=mode,["playerCount"]=Math.Max(1,Roster.ActiveCount()),
                ["players"]=Roster.Snapshot().Where(e=>!e.IsHost&&e.Status!=PlayerStatus.Left&&e.Status!=PlayerStatus.Failed).Select(e=>e.SteamId).ToArray(),
                ["game"]=game,["started"]=started,["ended"]=ended
            };
            if(Code!=null) {d["code"]=Code;d["token"]=token;}
            var legs=RelayLeg.Encode(relays);if(legs.Count>0)d["relays"]=legs;
            return d;
        }
        public static Dictionary<string,object> PeerBody(MacInstall i,List<Candidate> candidates,bool? symmetric) => new() {
            ["steamId"]=MacInstall.AccountId(),["candidates"]=candidates.Select(c=>c.ToString()).ToArray(),["upnp"]=false,
            ["symmetricNat"]=symmetric,["protocolVersion"]=RoomApi.ProtocolVersion,["launcherVersion"]="0.6.3-mac.3",["mapVersion"]=i.Manifest
        };
        async Task Run(CancellationToken ct) {
            bool failed=false;string failure=null;
            try {
                ResetRoom();
                Event("checking","检查 Steam、地图版本和本机端口…");
                CheckInstall();CheckLatestMap();
                ct.ThrowIfCancellationRequested();
                mount=install.Mount();
                Tunnel=new HostTunnel{GameReady=false};
                var candidates=Tunnel.Gather(out var publicIp);
                ct.ThrowIfCancellationRequested();
                body=PeerBody(install,candidates,Tunnel.SymmetricNat);body["publicIp"]=publicIp;
                OpenRoom(ct);
                Event("loading","房间已创建，正在加载地图。可以先把房间码发给朋友。");
                StartServer();
                await MonitorRoom(ct);
            } catch(OperationCanceledException) {}catch(Exception e) {failed=true;failure=e.Message;}
            finally {await CloseRoom(failed,failure);}
        }
        void ResetRoom() {
            Code=null;game=1;Ready=false;started=false;ended=false;saved=false;endedAt=null;seen.Clear();
            while(results.TryDequeue(out _)){}while(next.TryDequeue(out _)){}
            relays=new();Roster=new HostRoster();
        }
        void CheckInstall() {
            install=MacInstall.Find();Manifest=install.Manifest;
            if(MacInstall.AccountId()<=0)throw new Exception("未找到最近登录的 Steam 账号。请先在 Steam 登录后重试。");
            foreach(int port in new[]{27015,27016}) {using var probe=new UdpClient(new IPEndPoint(IPAddress.Loopback,port));}
            var tcpProbe=new TcpListener(IPAddress.Loopback,27080);try{tcpProbe.Start();}finally{tcpProbe.Stop();}
        }
        void CheckLatestMap() {
            // 线上版本查询失败不阻止开房，加入时仍会校验双方地图版本。
            try {
                var version=LocalTestSkipLatestCheck ? new Dictionary<string,object>{{"manifest",install.Manifest}} : Http.Json(Updater.DirectApi+"workshop/"+MacInstall.MapId,null,4000);
                if(version.TryGetValue("manifest",out var latest)&&Convert.ToString(latest)!=install.Manifest)
                    throw new MapOutdatedException();
            } catch(MapOutdatedException) {throw new Exception("地图不是最新版本。请在 Steam 更新地图后重试，双方必须使用相同版本。");}
            catch {Info("未能查询线上地图版本；加入时仍会检查双方地图版本是否一致。");}
        }
        void OpenRoom(CancellationToken ct) {
            Event("opening","正在创建私密房间…");
            var opened=RoomApi.Host(HostBody());Code=(string)opened["code"];token=(string)opened["token"];
            Roster.Add(new RosterEntry{SteamId=MacInstall.AccountId(),Key="host",Name=Field(opened,"personaName")??"房主",IsHost=true,Status=PlayerStatus.Loading});
            StartRoomNetwork();
            MeasureRelays(RelayTicket.ReadAddresses(opened,"relayAddresses","relayAddress"),ct);
        }
        void StartRoomNetwork() {
            Tunnel.RosterSource=Roster.Snapshot;
            Tunnel.JoinFinished+=(id,path,relay,ms)=> {
                var r=new Dictionary<string,object>{{"joinId",id},{"elapsedMs",ms}};
                if(path!=null)r["path"]=path;if(relay!=null)r["relayAddress"]=relay;
                results.Enqueue(r);Roster.SetStatus(id,path==null?PlayerStatus.Failed:PlayerStatus.Loading);
                Info(path==null?"一位玩家未能连通，可让对方重试。":"玩家网络已连通："+path);
            };
            Tunnel.JoinLeft+=id=>Roster.SetStatus(id,PlayerStatus.Left);
            Tunnel.GameTraffic+=Roster.SetEntering;Tunnel.Start();
            rosterServer=new RosterServer(Roster.Snapshot,()=>maxPlayers);rosterServer.Start();
            gate=new LocalGate(27015);
        }
        void MeasureRelays(List<IPEndPoint> addresses,CancellationToken ct) {
            var measuring=Tunnel;
            _=Task.Run(()=> {var legs=new List<RelayLeg>();foreach(var a in addresses) {if(ct.IsCancellationRequested)break;legs.Add(new RelayLeg(a){Quality=measuring.MeasureRelay(a)});}relays=legs;});
        }
        sealed class RoomPoll {
            public DateTime PollAt=DateTime.UtcNow,LoadAt=DateTime.UtcNow;
            public readonly List<Dictionary<string,object>> Results=new(),Checks=new();
            public DateTime QualityAt=DateTime.UtcNow;
            public readonly List<Dictionary<string,object>> Quality=new();
            public bool AutoAsked;
            public int Failures;
        }
        async Task MonitorRoom(CancellationToken ct) {
            var poll=new RoomPoll();
            while(!ct.IsCancellationRequested) {
                ReadConsole();
                UpdateGameState(poll);
                if(saved&&next.TryDequeue(out var nextMode))StartNextGame(nextMode,poll);
                if(DateTime.UtcNow>=poll.PollAt)PollRoom(poll);
                await Task.Delay(250,ct);
            }
        }
        void UpdateGameState(RoomPoll poll) {
            CheckServer(poll.LoadAt);
            if(Ready&&!poll.AutoAsked) {poll.AutoAsked=true;Event("ready","等待朋友加入后，从 Dota 2 里点「锁定并开始」");if(autoEnter)Enter();}
            ReleaseJoiningPlayers();
            if(ended&&!saved&&(DateTime.UtcNow-endedAt.Value).TotalSeconds>60)MarkSaved();
        }
        void CheckServer(DateTime loadAt) {
            if(server.HasExited&&!ended)throw new Exception("专用服务器已退出，请打开日志查看原因。");
            if(!Ready&&!ended&&(DateTime.UtcNow-loadAt).TotalSeconds>180)throw new Exception("服务器加载超过 180 秒，请查看日志。");
        }
        void ReleaseJoiningPlayers() {
            if(!Tunnel.GameReady&&Ready&&(HostInGame||(DateTime.UtcNow-readyAt).TotalSeconds>30))Tunnel.GameReady=true;
        }
        void StartNextGame(string nextMode,RoomPoll poll) {
            mode=nextMode;Ready=false;started=false;ended=false;saved=false;endedAt=null;game++;
            Tunnel.Game=game;Tunnel.GameReady=false;Tunnel.GameEnded=false;Roster.SetAll(PlayerStatus.Waiting);
            StopServer();body["mapVersion"]=MacInstall.Find().Manifest;
            // 服务器停止后才能切换地图链接，避免读取中的资源发生变化。
            mount.Dispose();install=MacInstall.Find();mount=install.Mount();
            Event("loading","正在启动下一局…");StartServer();poll.LoadAt=DateTime.UtcNow;poll.AutoAsked=false;poll.PollAt=DateTime.MinValue;
        }
        void PollRoom(RoomPoll poll) {
            poll.PollAt=DateTime.UtcNow.AddSeconds(started?10:2);
            var request=PollBody(poll);
            try {
                var answer=RoomApi.Host(request);poll.Results.Clear();poll.Checks.Clear();poll.Quality.Clear();
                if(poll.Failures>0)Info("房间服务连接已恢复。");poll.Failures=0;
                foreach(Dictionary<string,object> join in (object[])answer["joins"])AddJoin(join);
            } catch(Exception e) {poll.Failures++;if(poll.Failures==1||poll.Failures%10==0)Info("房间服务暂时无法连接，将重试："+e.Message);}
            emit(new{type="roster",players=Roster.Snapshot().Select(e=>new{name=e.Name,status=(int)e.Status,host=e.IsHost}).ToArray()});
        }
        Dictionary<string,object> PollBody(RoomPoll poll) {
            var request=HostBody();
            while(results.TryDequeue(out var r))poll.Results.Add(r);
            request["results"]=poll.Results.ToArray();
            poll.Checks.AddRange(Tunnel.TakeRouteChecks());if(poll.Checks.Count>50)poll.Checks.RemoveRange(0,poll.Checks.Count-50);
            request["routeChecks"]=poll.Checks.ToArray();
            if((DateTime.UtcNow-poll.QualityAt).TotalSeconds>60) {poll.Quality.AddRange(Tunnel.TakeQuality());poll.QualityAt=DateTime.UtcNow;}
            if(poll.Quality.Count>50)poll.Quality.RemoveRange(0,poll.Quality.Count-50);
            request["quality"]=poll.Quality.ToArray();
            return request;
        }
        void AddJoin(Dictionary<string,object> join) {
            var id=(string)join["joinId"];if(!seen.Add(id))return;
            bool probe=join.TryGetValue("probe",out var pv)&&true.Equals(pv);
            if(!probe)Roster.Add(new RosterEntry{Key=id,SteamId=Convert.ToInt64(join.GetValueOrDefault("steamId",0)),Name=Field(join,"personaName")??"玩家",AvatarUrl=Field(join,"avatarUrl"),Status=PlayerStatus.Connecting});
            var peers=((object[])join["candidates"]).Select(x=>Candidate.Parse((string)x)).ToList();
            Tunnel.AddJoin(id,(string)join["joinToken"],peers,probe,RelayTicket.Read(join));
        }
        async Task CloseRoom(bool failed,string failure) {
            Ready=false;
            cancel?.Cancel();await entering;
            if(Code!=null&&body!=null)try{var d=HostBody();d["public"]=false;d["ended"]=true;d["started"]=true;RoomApi.Host(d);}catch{}
            Tunnel?.Dispose();Tunnel=null;gate?.Dispose();gate=null;rosterServer?.Dispose();rosterServer=null;
            StopServer();try{mount?.Dispose();}catch(Exception e){Info("地图链接清理失败："+e.Message);}mount=null;
            lock(logLock) {log?.Dispose();log=null;}
            if(failed)Event("error",failure);else Event("idle","房间已关闭。");
            Code=null;
        }
        static string Field(Dictionary<string,object> d,string k)=>d.GetValueOrDefault(k) as string;
        void StartServer() {
            Directory.CreateDirectory(Logs);ServerLog=Path.Combine(Logs,"server-"+DateTime.Now.ToString("yyyyMMdd-HHmmss")+"-"+game+".log");
            lock(logLock) {log?.Dispose();log=new StreamWriter(ServerLog){AutoFlush=true};}
            consolePath=Path.Combine(install.Game,"dota","windymac-"+Guid.NewGuid().ToString("N")+".log");consolePending="";signon=new ClientSignon();
            dedicated=new DedicatedBundle(install);
            var pi=new ProcessStartInfo(dedicated.Exe){WorkingDirectory=install.Game,UseShellExecute=false,RedirectStandardOutput=true,RedirectStandardError=true};
            pi.Environment["SteamAppId"]="570";pi.Environment["DYLD_LIBRARY_PATH"]=Path.Combine(install.Game,"bin/osx64");
            foreach(var a in new[]{"-dedicated","-game",Path.Combine(install.Game,"dota"),"-console","-con_logfile",Path.GetFileName(consolePath),"-allow_no_lobby_connect","-ip","127.0.0.1","-port","27015","+sv_hibernate_when_empty","0","+dota_quit_after_game","0","+net_limit_sv_message_process_time_ms_drop_burst","2000","+net_limit_sv_message_process_time_ms_drop_rate","200","+hostname","windy10v10ai-room","+map "+(mode=="easy"?"dota":mode)+" gamemode=15 customgamemode="+MacInstall.MapId+" nomapvalidation=1"})pi.ArgumentList.Add(a);
            server=new Process{StartInfo=pi};server.OutputDataReceived+=(_,e)=>RawLine(e.Data);server.ErrorDataReceived+=(_,e)=>RawLine(e.Data);
            server.Start();server.BeginOutputReadLine();server.BeginErrorReadLine();
        }
        void RawLine(string line) {if(line!=null)lock(logLock)log?.WriteLine(line);}
        void ReadConsole() {
            if(consolePath==null)return;
            if(consoleReader==null) {if(!File.Exists(consolePath))return;consoleReader=new StreamReader(new FileStream(consolePath,FileMode.Open,FileAccess.Read,FileShare.ReadWrite));}
            consolePending+=consoleReader.ReadToEnd();int at;
            while((at=consolePending.IndexOf('\n'))>=0) {var line=consolePending.Substring(0,at);consolePending=consolePending.Substring(at+1);ServerLine(line);}
        }
        void ServerLine(string line) {
            if(line==null)return;
            if(line.Contains("Host activate: Loading (")) {readyAt=DateTime.UtcNow;Ready=true;}
            if(line.Contains("DOTA_GAMERULES_STATE_HERO_SELECTION")) {started=true;Event("playing","本局已开始。");}
            var entered=signon.Entered(line);
            var left=signon.Left(line);
            if(left!=null)foreach(var player in Roster.Snapshot().Where(e=>e.SteamId==left.Value-76561197960265728))Roster.SetStatus(player.Key,PlayerStatus.InRoom);
            if(entered!=null) {Roster.SetInGame(entered.Value);emit(new{type="playerConnected",hostInGame=HostInGame});}
            if(!ended&&(line.Contains("/api/game/end")||line.Contains("entering state 'DOTA_GAMERULES_STATE_POST_GAME'"))) {
                ended=true;endedAt=DateTime.UtcNow;if(Tunnel!=null)Tunnel.GameEnded=true;Event("saving","本局结束，正在等待结算保存…");
            }
            if(ended&&line.Contains("[Game] end game callback"))MarkSaved();
        }
        void MarkSaved() {if(saved)return;saved=true;Roster.SetAll(PlayerStatus.InRoom);Event("ended","游戏已结束，可以启动下一局。");}
        void StopServer() {
            var p=server;server=null;if(p==null){dedicated?.Dispose();dedicated=null;return;}
            try {if(!p.HasExited) {
                // 先请求服务器正常退出，使其有机会关闭网络连接和日志。
                using var kill=Process.Start(new ProcessStartInfo("/bin/kill"){ArgumentList={"-TERM",p.Id.ToString()},UseShellExecute=false});kill.WaitForExit();
                if(!p.WaitForExit(5000))p.Kill();
            }p.WaitForExit();}catch{}finally{p.Dispose();consoleReader?.Dispose();consoleReader=null;if(consolePath!=null)try{File.Delete(consolePath);}catch{}consolePath=null;dedicated?.Dispose();dedicated=null;}
        }
        sealed class MapOutdatedException:Exception {}
    }
}
