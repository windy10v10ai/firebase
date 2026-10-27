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
        JoinRoomSession room;
        JoinTunnel tunnel => room?.Tunnel;
        MacInstall install;
        volatile bool autoEnter;
        RoomBrowser browser;
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
            try { return JoinRoomSession.NormalizeCode(code); }
            catch (RoomError e) { throw new Exception(JoinRoomSession.ErrorText(e.Code)); }
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
            JoinRoomSession current = null;
            string failure = null;
            try
            {
                Event("checking", Strings.Starting);
                var accountId = CheckInstall(ct);
                mount = options.Mount(install);
                current = new JoinRoomSession(new JoinRoomSessionOptions
                {
                    CreateTunnel = () => options.CreateTunnel(),
                    Gather = t => options.Gather(t),
                    JoinRoom = (code, body) => options.JoinRoom(code, body)
                });
                lock (runLock) room = current;
                var source = browser;
                await RunNetwork(() => current.Prepare(source, ct), ct);
                browser = null;
                Event("joining", Strings.Connecting);
                var code = Code;
                await RunNetwork(() => current.Open(code, accountId, install.Manifest, ct), ct);
                EmitRoster(current.Tunnel);
                current.Connect(ct);
                current.Forward(options.ForwardPort);
                Event("waiting", Strings.StatusWaiting);
                await Watch(current, ct);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { }
            catch (Exception) when (ct.IsCancellationRequested) { }
            catch (RoomError e) { failure = JoinRoomSession.ErrorText(e.Code); }
            catch (Exception e) { failure = e.Message; }
            finally
            {
                Ready = false;
                lock (runLock) cancel?.Cancel();
                await entering;
                current?.Dispose(); room = null; browser?.Dispose(); browser = null;
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
        static async Task RunNetwork(Action operation, CancellationToken ct)
        {
            var work = Task.Run(operation);
            try { await work.WaitAsync(ct); }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                // HTTP 请求可能晚于离房结束，仍需观察它最终返回的异常。
                _ = work.ContinueWith(t => { _ = t.Exception; }, TaskContinuationOptions.OnlyOnFaulted | TaskContinuationOptions.ExecuteSynchronously);
                throw;
            }
        }
        async Task Watch(JoinRoomSession current, CancellationToken ct)
        {
            while (true)
            {
                ct.ThrowIfCancellationRequested();
                var lifecycle = current.Observe();
                if (lifecycle.State == JoinState.Kicked) throw new Exception(Strings.KickedByHost);
                if (lifecycle.State == JoinState.Closed) return;
                if (lifecycle.State == JoinState.HostLost) throw new Exception(Strings.HostLost);
                ShowReadiness(lifecycle.State);
                if (lifecycle.NewGameReady && (lifecycle.FirstGame || options.ClientRunning()) && autoEnter) Enter();
                EmitRoster(current.Tunnel);
                EmitRoute(current.Tunnel);
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
            var message = current.Silent ? Strings.HostSilent : current.Checking || quality.Rtt < 0 ? Strings.RouteChecking
                : quality.Split ? string.Format(Strings.RouteQualitySplit, route, quality.Rtt, quality.LossDown, quality.LossUp) : string.Format(Strings.RouteQuality, route, quality.Rtt, quality.Loss);
            var level = current.Silent || quality.Lossy ? "warn" : current.Checking || quality.Rtt < 0 ? "checking" : "ok";
            emit(new { type = "route", message, level, path, rtt = quality.Rtt, loss = quality.Loss, checking = current.Checking, silent = current.Silent });
        }
        void EmitRoster(JoinTunnel current) => emit(new { type = "roster", role = "join", players = current.Roster().Select(p => new { key = p.Key, steamId = p.SteamId, name = p.Name, avatarUrl = p.AvatarUrl, status = (int)p.Status, host = p.IsHost }).ToArray() });
    }
}
