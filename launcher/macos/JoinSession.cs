// GPL-3.0.
namespace Windy10v10AI.Launcher
{
    sealed class JoinSessionOptions
    {
        public Func<MacInstall> FindInstall = () => MacInstall.Find();
        public Func<long> AccountId = MacInstall.AccountId;
        public Func<JoinTunnel> CreateTunnel = () => new JoinTunnel();
        public Func<JoinTunnel, List<Candidate>> Gather = t => t.Gather(out _);
        public Func<string, Dictionary<string, object>, Dictionary<string, object>> JoinRoom = RoomApi.Join;
        public Func<MacInstall, IDisposable> Mount = i => i.Mount();
        public Func<MacInstall, Action<string>, CancellationToken, Task> EnterClient = (i, info, ct) => i.EnterClient(info, ct);
        public Func<bool> ClientRunning = MacInstall.ClientRunning;
        public int ForwardPort = 27016;
        public int MonitorIntervalMs = 250;
    }
    sealed class JoinSession
    {
        readonly Action<object> emit;
        readonly JoinSessionOptions options;
        readonly object runLock = new();
        CancellationTokenSource cancel;
        Task worker, entering = Task.CompletedTask;
        JoinTunnel tunnel;
        MacInstall install;
        bool autoEnter;
        RoomBrowser browser;
        List<Candidate> browsingCandidates;
        List<RelayLeg> browsingRelays;
        public string State { get; private set; } = "idle";
        public string Code { get; private set; }
        public bool Ready { get; private set; }
        public bool Active { get { lock (runLock) return worker != null && !worker.IsCompleted; } }
        public JoinSession(Action<object> emit) : this(emit, new JoinSessionOptions()) { }
        internal JoinSession(Action<object> emit, JoinSessionOptions options) { this.emit = emit; this.options = options; }
        void Event(string state, string message)
        {
            State = state;
            emit(new { type = "state", role = "join", state, message, code = Code ?? "", log = "", game = tunnel?.Game ?? 0 });
        }
        void Info(string message) => emit(new { type = "message", message });
        public void Start(string code, bool enter, RoomBrowser source = null)
        {
            code = NormalizeCode(code);
            lock (runLock)
            {
                if (worker != null && !worker.IsCompleted) throw new Exception(Strings.SessionActive);
                cancel?.Dispose(); cancel = new CancellationTokenSource(); Code = code; autoEnter = enter; Ready = false; browser = source;
                var ct = cancel.Token;
                worker = Task.Run(() => Run(ct));
            }
        }
        public static string NormalizeCode(string code)
        {
            code = (code ?? "").Trim().ToUpperInvariant();
            if (code.Length != 6 || code.Any(c => !(c >= 'A' && c <= 'Z') && !(c >= '0' && c <= '9'))) throw new Exception(Strings.InvalidCode);
            return code;
        }
        public void SetAutoEnter(bool enabled) { autoEnter = enabled; }
        public async Task Stop()
        {
            Task current;
            lock (runLock) { cancel?.Cancel(); current = worker; }
            if (current != null) await current;
        }
        public void Enter()
        {
            lock (runLock)
            {
                if (!Ready || tunnel == null || !tunnel.HasRoster || !tunnel.GameReady || tunnel.GameEnded || cancel == null || cancel.IsCancellationRequested) throw new Exception(Strings.ServerNotReady);
                if (!entering.IsCompleted) return;
                var ct = cancel.Token;
                entering = Task.Run(async () =>
                {
                    try { await options.EnterClient(install, Info, ct); }
                    catch (OperationCanceledException) when (ct.IsCancellationRequested) { }
                    catch (Exception e) { Info(Strings.LaunchFailed + e.Message); }
                });
            }
        }
        async Task Run(CancellationToken ct)
        {
            IDisposable mount = null;
            CancellationTokenRegistration registration = default;
            string failure = null;
            try
            {
                Event("checking", Strings.Starting);
                var accountId = CheckInstall(ct);
                mount = options.Mount(install);
                if (browser != null)
                {
                    browsingRelays = browser.OwnRelays;
                    tunnel = browser.TakeTunnel(out browsingCandidates);
                    browser.Dispose(); browser = null;
                }
                tunnel ??= options.CreateTunnel();
                var current = tunnel;
                // 取消必须同时关闭套接字，才能唤醒同步网络探测。
                registration = ct.Register(() => current.Dispose());
                ct.ThrowIfCancellationRequested();
                var joined = await OpenRoom(current, accountId, ct);
                PrepareConnection(current, joined, accountId, ct);
                Event("waiting", Strings.StatusWaiting);
                await Watch(current, ct);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { }
            catch (Exception) when (ct.IsCancellationRequested) { }
            catch (RoomError e) { failure = JoinError(e.Code); }
            catch (Exception e) { failure = e.Message; }
            finally
            {
                Ready = false;
                lock (runLock) cancel?.Cancel();
                await entering;
                registration.Dispose();
                tunnel?.Dispose(); tunnel = null; browser?.Dispose(); browser = null; browsingCandidates = null; browsingRelays = null;
                try { mount?.Dispose(); } catch (Exception e) { failure ??= Strings.MapCleanupFailed + e.Message; }
                Code = null;
                emit(new { type = "roster", role = "join", players = Array.Empty<object>() });
                Event(failure == null ? "idle" : "error", failure ?? Strings.JoinGuide);
            }
        }
        long CheckInstall(CancellationToken ct)
        {
            install = options.FindInstall();
            long accountId = options.AccountId();
            if (accountId <= 0) throw new Exception(Strings.SteamNotSignedIn);
            ct.ThrowIfCancellationRequested();
            return accountId;
        }
        async Task<Dictionary<string, object>> OpenRoom(JoinTunnel current, long accountId, CancellationToken ct)
        {
            var candidates = browsingCandidates ?? await Task.Run(() => options.Gather(current)).WaitAsync(ct);
            ct.ThrowIfCancellationRequested();
            if (browsingCandidates == null) current.Start();
            Event("joining", Strings.Connecting);
            var body = HostSession.PeerBody(install, candidates, current.SymmetricNat); body["steamId"] = accountId;
            if (browsingRelays != null) { var relays = RelayLeg.Encode(browsingRelays); if (relays.Count > 0) { body["relays"] = relays; body["relayRtt"] = relays[0]["rtt"]; body["relayLoss"] = relays[0]["loss"]; } }
            var code = Code;
            var joined = await Task.Run(() => options.JoinRoom(code, body)).WaitAsync(ct);
            ct.ThrowIfCancellationRequested();
            return joined;
        }
        void PrepareConnection(JoinTunnel current, Dictionary<string, object> joined, long accountId, CancellationToken ct)
        {
            var host = joined.GetValueOrDefault("host") as Dictionary<string, object> ?? new();
            var self = joined.GetValueOrDefault("self") as Dictionary<string, object> ?? new();
            current.Placeholder = new List<RosterEntry> {
                new(){Name=Field(host,"personaName")??Strings.TagHost,AvatarUrl=Field(host,"avatarUrl"),IsHost=true,Status=PlayerStatus.Connecting},
                new(){SteamId=accountId,Name=Field(self,"personaName")??Strings.Player,AvatarUrl=Field(self,"avatarUrl"),Status=PlayerStatus.Connecting}
            };
            EmitRoster(current);
            var peers = ((object[])joined["hostCandidates"]).Select(c => Candidate.Parse((string)c)).ToList();
            var path = current.Connect((string)joined["joinToken"], peers, RelayTicket.Read(joined));
            ct.ThrowIfCancellationRequested();
            if (current.Kicked) throw new Exception(Strings.KickedByHost);
            if (path == null) throw new Exception(Strings.ConnectFailed);
            current.Thresholds = RouteThresholds.Read(joined); current.StartRouteCheck();
            try { current.Forward(options.ForwardPort); }
            catch (System.Net.Sockets.SocketException) { throw new Exception(Strings.PortInUse); }
        }
        async Task Watch(JoinTunnel current, CancellationToken ct)
        {
            var lifecycle = new JoinLifecycle(current.Game, false);
            while (true)
            {
                ct.ThrowIfCancellationRequested();
                lifecycle.Observe(current);
                if (lifecycle.State == JoinState.Kicked) throw new Exception(Strings.KickedByHost);
                if (lifecycle.State == JoinState.Closed) return;
                if (lifecycle.State == JoinState.HostLost) throw new Exception(Strings.HostLost);
                ShowReadiness(lifecycle.State);
                if (lifecycle.NewGameReady && autoEnter && (lifecycle.FirstGame || options.ClientRunning())) Enter();
                EmitRoster(current);
                EmitRoute(current);
                await Task.Delay(options.MonitorIntervalMs, ct);
            }
        }
        void ShowReadiness(JoinState state)
        {
            Ready = state == JoinState.Ready;
            if (Ready)
            {
                if (State != "ready") Event("ready", Strings.EnterGame);
                return;
            }
            string nextState = state == JoinState.Ended ? "ended" : "waiting";
            if (State != nextState) Event(nextState, state == JoinState.Ended ? Strings.GameEnded : Strings.StatusWaiting);
        }
        void EmitRoute(JoinTunnel current)
        {
            var quality = current.Status(out var path);
            var route = path == PathType.Relay ? Strings.RouteRelay : path == PathType.Lan ? Strings.RouteLan : Strings.RouteDirect;
            var message = current.Silent ? Strings.HostSilent : current.Checking || quality.Rtt < 0 ? Strings.RouteChecking : string.Format(Strings.RouteQuality, route, quality.Rtt, quality.Loss);
            emit(new { type = "route", message, path, rtt = quality.Rtt, loss = quality.Loss, checking = current.Checking, silent = current.Silent });
        }
        void EmitRoster(JoinTunnel current) => emit(new { type = "roster", role = "join", players = current.Roster().Select(p => new { key = p.Key, steamId = p.SteamId, name = p.Name, avatarUrl = p.AvatarUrl, status = (int)p.Status, host = p.IsHost }).ToArray() });
        static string Field(Dictionary<string, object> d, string key) => d.GetValueOrDefault(key) as string;
        static string JoinError(string code) => code switch
        {
            "room_not_found" => Strings.RoomNotFound,
            "room_full" => Strings.RoomFull,
            "kicked" => Strings.KickedJoin,
            "map_mismatch" or "map_version_mismatch" => Strings.MapMismatch,
            "version_mismatch" or "protocol_mismatch" => Strings.VersionMismatch,
            "network" => Strings.RoomNetwork,
            "game_started" => Strings.GameStarted,
            _ => Strings.LaunchFailed + code
        };
    }
}
