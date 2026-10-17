// GPL-3.0.
namespace Windy10v10AI.Launcher {
    sealed class JoinSessionOptions {
        public Func<MacInstall> FindInstall=MacInstall.Find;
        public Func<long> AccountId=MacInstall.AccountId;
        public Func<JoinTunnel> CreateTunnel=()=>new JoinTunnel();
        public Func<JoinTunnel,List<Candidate>> Gather=t=>t.Gather(out _);
        public Func<string,Dictionary<string,object>,Dictionary<string,object>> JoinRoom=RoomApi.Join;
        public Func<MacInstall,IDisposable> Mount=i=>i.Mount();
        public Func<MacInstall,Action<string>,CancellationToken,Task> EnterClient=(i,info,ct)=>i.EnterClient(info,ct);
        public Func<bool> ClientRunning=MacInstall.ClientRunning;
        public int ForwardPort=27016;
        public int MonitorIntervalMs=250;
    }
    sealed class JoinSession {
        readonly Action<object> emit;
        readonly JoinSessionOptions options;
        readonly object runLock=new();
        CancellationTokenSource cancel;
        Task worker,entering=Task.CompletedTask;
        JoinTunnel tunnel;
        MacInstall install;
        bool autoEnter;
        public string State {get;private set;}="idle";
        public string Code {get;private set;}
        public bool Ready {get;private set;}
        public bool Active {get{lock(runLock)return worker!=null&&!worker.IsCompleted;}}
        public JoinSession(Action<object> emit):this(emit,new JoinSessionOptions()) {}
        internal JoinSession(Action<object> emit,JoinSessionOptions options) {this.emit=emit;this.options=options;}
        void Event(string state,string message) {
            State=state;
            emit(new{type="state",role="join",state,message,code=Code??"",log="",game=tunnel?.Game??0});
        }
        void Info(string message)=>emit(new{type="message",message});
        public void Start(string code,bool enter) {
            code=(code??"").Trim().ToUpperInvariant();
            if(code.Length!=6||code.Any(c=>!(c>='A'&&c<='Z')&&!(c>='0'&&c<='9')))throw new Exception("请输入 6 位房间码。");
            lock(runLock) {
                if(worker!=null&&!worker.IsCompleted)throw new Exception("请先离开当前房间。");
                cancel?.Dispose();cancel=new CancellationTokenSource();Code=code;autoEnter=enter;Ready=false;
                var ct=cancel.Token;
                worker=Task.Run(()=>Run(ct));
            }
        }
        public async Task Stop() {
            Task current;
            lock(runLock) {cancel?.Cancel();current=worker;}
            if(current!=null)await current;
        }
        public void Enter() {
            lock(runLock) {
                if(!Ready||tunnel==null||!tunnel.HasRoster||!tunnel.GameReady||tunnel.GameEnded||cancel==null||cancel.IsCancellationRequested)throw new Exception("请等待房主的服务器准备好后再进入。");
                if(!entering.IsCompleted)return;
                var ct=cancel.Token;
                entering=Task.Run(async()=> {
                    try {await options.EnterClient(install,Info,ct);}
                    catch(OperationCanceledException)when(ct.IsCancellationRequested) {}
                    catch(Exception e) {Info("进入失败："+e.Message);}
                });
            }
        }
        async Task Run(CancellationToken ct) {
            IDisposable mount=null;
            CancellationTokenRegistration registration=default;
            string failure=null;
            try {
                Event("checking","正在检查 Steam 和地图版本…");
                var accountId=CheckInstall(ct);
                mount=options.Mount(install);
                tunnel=options.CreateTunnel();
                var current=tunnel;
                // 取消必须同时关闭套接字，才能唤醒同步网络探测。
                registration=ct.Register(()=>current.Dispose());
                ct.ThrowIfCancellationRequested();
                var joined=await OpenRoom(current,accountId,ct);
                PrepareConnection(current,joined,accountId,ct);
                Event("waiting","已加入房间，等待房主的服务器准备好…");
                await Watch(current,ct);
            }catch(OperationCanceledException)when(ct.IsCancellationRequested) {}
            catch(Exception)when(ct.IsCancellationRequested) {}
            catch(RoomError e) {failure=JoinError(e.Code);}
            catch(Exception e) {failure=e.Message;}
            finally {
                Ready=false;
                lock(runLock)cancel?.Cancel();
                await entering;
                registration.Dispose();
                tunnel?.Dispose();tunnel=null;
                try {mount?.Dispose();}catch(Exception e) {failure??="地图链接清理失败："+e.Message;}
                Code=null;
                emit(new{type="roster",role="join",players=Array.Empty<object>()});
                Event(failure==null?"idle":"error",failure??"已离开房间。");
            }
        }
        long CheckInstall(CancellationToken ct) {
            install=options.FindInstall();
            long accountId=options.AccountId();
            if(accountId<=0)throw new Exception("未找到最近登录的 Steam 账号。请先在 Steam 登录后重试。");
            ct.ThrowIfCancellationRequested();
            return accountId;
        }
        async Task<Dictionary<string,object>> OpenRoom(JoinTunnel current,long accountId,CancellationToken ct) {
            var candidates=await Task.Run(()=>options.Gather(current)).WaitAsync(ct);
            ct.ThrowIfCancellationRequested();
            current.Start();
            Event("joining","正在加入房间…");
            var body=HostSession.PeerBody(install,candidates,current.SymmetricNat);body["steamId"]=accountId;
            var code=Code;
            var joined=await Task.Run(()=>options.JoinRoom(code,body)).WaitAsync(ct);
            ct.ThrowIfCancellationRequested();
            return joined;
        }
        void PrepareConnection(JoinTunnel current,Dictionary<string,object> joined,long accountId,CancellationToken ct) {
            var host=joined.GetValueOrDefault("host") as Dictionary<string,object>??new();
            var self=joined.GetValueOrDefault("self") as Dictionary<string,object>??new();
            current.Placeholder=new List<RosterEntry> {
                new(){Name=Field(host,"personaName")??"房主",AvatarUrl=Field(host,"avatarUrl"),IsHost=true,Status=PlayerStatus.Connecting},
                new(){SteamId=accountId,Name=Field(self,"personaName")??"玩家",AvatarUrl=Field(self,"avatarUrl"),Status=PlayerStatus.Connecting}
            };
            EmitRoster(current);
            var peers=((object[])joined["hostCandidates"]).Select(c=>Candidate.Parse((string)c)).ToList();
            var path=current.Connect((string)joined["joinToken"],peers,RelayTicket.Read(joined));
            ct.ThrowIfCancellationRequested();
            if(current.Kicked)throw new Exception("你已被房主移出房间。");
            if(path==null)throw new Exception("无法连接房主，请检查网络后重新加入。");
            current.Thresholds=RouteThresholds.Read(joined);current.StartRouteCheck();
            try {current.Forward(options.ForwardPort);}
            catch(System.Net.Sockets.SocketException) {throw new Exception("本机端口被占用，请先关闭其他启动器后重试。");}
        }
        async Task Watch(JoinTunnel current,CancellationToken ct) {
            int game=current.Game;
            bool entered=false,firstGame=true;
            while(true) {
                ct.ThrowIfCancellationRequested();
                if(RoomClosed(current))return;
                if(game!=current.Game) {game=current.Game;entered=false;}
                ShowReadiness(current);
                if(Ready&&!entered) {
                    entered=true;
                    if(autoEnter&&(firstGame||options.ClientRunning()))Enter();
                    firstGame=false;
                }
                EmitRoster(current);
                await Task.Delay(options.MonitorIntervalMs,ct);
            }
        }
        static bool RoomClosed(JoinTunnel current) {
            if(current.Kicked)throw new Exception("你已被房主移出房间。");
            if(!current.Lost)return false;
            if(current.GameEnded||!current.GameReady)return true;
            throw new Exception("与房主的连接已断开，请重新加入房间。");
        }
        void ShowReadiness(JoinTunnel current) {
            Ready=current.HasRoster&&current.GameReady&&!current.GameEnded;
            if(Ready) {
                if(State!="ready")Event("ready","房间已准备好，可以进入游戏。");
                return;
            }
            string state=current.HasRoster&&current.GameEnded?"ended":"waiting";
            if(State!=state)Event(state,state=="ended"?"游戏已结束，等待房主启动下一局。":"等待房主的服务器准备好…");
        }
        void EmitRoster(JoinTunnel current)=>emit(new{type="roster",role="join",players=current.Roster().Select(p=>new{name=p.Name,status=(int)p.Status,host=p.IsHost}).ToArray()});
        static string Field(Dictionary<string,object> d,string key)=>d.GetValueOrDefault(key) as string;
        static string JoinError(string code)=>code switch {
            "room_not_found"=>"找不到房间，请检查房间码或让房主重新创建。",
            "room_full"=>"房间已满，请联系房主。",
            "kicked"=>"你已被房主移出房间。",
            "map_mismatch" or "map_version_mismatch"=>"双方地图版本不一致，请在 Steam 更新地图后重试。",
            "version_mismatch" or "protocol_mismatch"=>"启动器版本不兼容，请更新启动器后重试。",
            "network"=>"无法连接房间服务，请检查网络后重试。",
            "game_started"=>"游戏已开始，请等待房主启动下一局。",
            _=>"加入房间失败，请重试："+code
        };
    }
}
