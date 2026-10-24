// GPL-3.0.
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
namespace Windy10v10AI.Launcher
{
    sealed class HostSession
    {
        public static readonly string Logs = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Library/Logs/WindyMac");
        public HostRoster Roster { get; private set; } = new();
        public HostTunnel Tunnel => room?.Tunnel;
        public string Code => room?.Code;
        public string Manifest { get; private set; }
        public string State { get; private set; } = "idle";
        public bool Ready { get; private set; }
        public bool Active { get { lock (runLock) return worker != null && !worker.IsCompleted; } }
        public bool HostInGame => Roster.InGame("host");
        public string ServerLog { get; private set; }
        readonly Action<object> emit;
        readonly object logLock = new(), runLock = new();
        CancellationTokenSource cancel;
        Task worker;
        Process server;
        LocalGate gate;
        IDisposable mount;
        DedicatedBundle dedicated;
        Task entering = Task.CompletedTask;
        MacInstall install;
        HostRoomSession room;
        string mode, lastMessage;
        int maxPlayers;
        int game => room?.Game ?? 1;
        readonly GameEnd gameEnd = new();
        bool ended => room?.Ended ?? gameEnd.Ended;
        bool saved => room?.Saved ?? gameEnd.Saved;
        DateTime readyAt;
        bool autoEnter;
        public bool Solo { get; private set; }
        public bool PublicRoom { get; private set; }
        public bool Saving => ended && !saved;
        public int MaxPlayers => maxPlayers;
        public string Difficulty => mode;
        public bool Paused => room?.Paused ?? false;
        readonly SoloLifecycle soloLifecycle = new();
        StreamWriter log;
        string consolePath, consolePending = ""; StreamReader consoleReader;
        ClientSignon signon = new();
        public bool LocalTestSkipLatestCheck { get; init; }
        readonly ConcurrentQueue<string> next = new();
        public HostSession(Action<object> emit) { this.emit = emit; }
        void Event(string state, string message) { State = state; lastMessage = message; emit(new { type = "state", role = Solo ? "solo" : "host", state, message, code = Code ?? "", log = ServerLog ?? "", game, saving = Saving, publicRoom = PublicRoom, maxPlayers, paused = Paused }); }
        void Info(string message) => emit(new { type = "message", message });
        public void Start(string difficulty, int count, bool enter) => Start(difficulty, count, enter, false, false);
        public void Start(string difficulty, int count, bool enter, bool solo, bool publicRoom)
        {
            if (!new[] { "easy", "hard", "custom" }.Contains(difficulty)) throw new Exception(Strings.InvalidDifficulty);
            if (count < 2 || count > 10) throw new Exception(Strings.InvalidPlayerLimit);
            lock (runLock)
            {
                if (worker != null && !worker.IsCompleted) throw new Exception(Strings.SessionActive);
                cancel?.Dispose(); cancel = new CancellationTokenSource(); mode = difficulty; maxPlayers = count; autoEnter = solo || enter; Solo = solo; PublicRoom = publicRoom;
                worker = Task.Run(() => Run(cancel.Token));
            }
        }
        public async Task Stop()
        {
            Task current; lock (runLock) { cancel?.Cancel(); current = worker; }
            if (current != null) await current;
        }
        public void Enter()
        {
            if (!Ready || ended) throw new Exception(Strings.ServerNotReady);
            if (!entering.IsCompleted) return;
            entering = Task.Run(async () => { try { await install.EnterClient(Info, cancel.Token); } catch (OperationCanceledException) { } catch (Exception e) { Info(Strings.LaunchFailed + e.Message); } });
        }
        public void Next(string difficulty)
        {
            if (!new[] { "easy", "hard", "custom" }.Contains(difficulty)) throw new Exception(Strings.InvalidDifficulty);
            if (Solo) throw new Exception(Strings.HostOnly);
            if (!saved) throw new Exception(Strings.WaitForResults);
            if (!next.IsEmpty) return;
            if (!LocalTestSkipLatestCheck)
            {
                var current = MacInstall.Find();
                var latest = Workshop.LatestManifest(current.SelectedMapId);
                if (latest != null && latest != current.Manifest) throw new Exception(Strings.NextGameMapOutdated);
            }
            next.Enqueue(difficulty);
        }
        public void ConfigureRoom(bool publicRoom, int count)
        {
            if (Solo || !Active) throw new Exception(Strings.HostOnly);
            var current = room;
            if (current != null) current.Configure(publicRoom, count);
            else if (count < 2 || count > 10) throw new Exception(Strings.InvalidPlayerLimit);
            PublicRoom = publicRoom; maxPlayers = count;
            Event(State, State == "ready" ? HostingHint() : lastMessage);
        }
        public void Kick(string key)
        {
            if (Solo || Tunnel == null) throw new Exception(Strings.HostOnly);
            room.Kick(key); EmitRoster();
        }
        public void Reopen()
        {
            if (Solo || !Active || !Paused) return;
            room.Reopen();
            Event(State, HostingHint());
        }
        string HostingHint() => PublicRoom ? Strings.PublicHostingHint : Strings.PrivateHostingHint;
        async Task Run(CancellationToken ct)
        {
            bool failed = false; string failure = null;
            try
            {
                ResetRoom();
                Event("checking", Strings.Starting);
                CheckInstall(); if (!Solo) CheckLatestMap();
                ct.ThrowIfCancellationRequested();
                mount = install.Mount();
                if (Solo)
                {
                    Roster.Add(new RosterEntry { SteamId = Platform.SteamAccountId(), Key = "host", Name = Strings.TagMe, IsHost = true, Status = PlayerStatus.Loading });
                    gate = new LocalGate(27015);
                }
                else
                {
                    room = new HostRoomSession(new HostTunnel(), Roster) { Map = mode };
                    room.Configure(PublicRoom, maxPlayers);
                    room.ConnectionFailed += () => Info(Strings.ConnectFailed);
                    var candidates = Tunnel.Gather(out var publicIp);
                    ct.ThrowIfCancellationRequested();
                    var body = RoomPeer.Body(MacInstall.AccountId(), install.Manifest, candidates, Tunnel.SymmetricNat); body["publicIp"] = publicIp;
                    Event("opening", Strings.OpeningRoom);
                    var opened = room.Open(body, MacInstall.AccountId(), autoEnter);
                    room.StartNetwork(opened);
                    gate = new LocalGate(27015);
                }
                Event("loading", Strings.Starting);
                StartServer();
                await MonitorRoom(ct);
            }
            catch (OperationCanceledException) { }
            catch (RoomError) { failed = true; failure = Strings.OpenRoomFailed; }
            catch (Exception e) { failed = true; failure = e.Message; }
            finally { await CloseRoom(failed, failure); }
        }
        void ResetRoom()
        {
            room = null; Ready = false; gameEnd.Reset(); soloLifecycle.Reset();
            while (next.TryDequeue(out _)) { }
            Roster = new HostRoster();
        }
        void CheckInstall()
        {
            install = MacInstall.Find(); Manifest = install.Manifest;
            if (!Solo && Platform.SteamAccountId() <= 0) throw new Exception(Strings.SteamNotSignedIn);
            foreach (int port in new[] { 27015, 27016 }) { using var probe = new UdpClient(new IPEndPoint(IPAddress.Loopback, port)); }
            if (!Solo) { var tcpProbe = new TcpListener(IPAddress.Loopback, 27080); try { tcpProbe.Start(); } finally { tcpProbe.Stop(); } }
        }
        void CheckLatestMap()
        {
            // 线上版本查询失败不阻止开房，加入时仍会校验双方地图版本。
            try
            {
                var latest = LocalTestSkipLatestCheck ? install.Manifest : Workshop.LatestManifest(install.SelectedMapId);
                if (latest == null) Info(Strings.MapUnverified);
                else if (latest != install.Manifest) throw new MapOutdatedException();
            }
            catch (MapOutdatedException) { throw new Exception(Strings.MapCardHost); }
            catch { Info(Strings.MapUnverified); }
        }
        sealed class RoomPoll
        {
            public DateTime LoadAt = DateTime.UtcNow;
            public DateTime RosterAt = DateTime.MinValue;
            public bool AutoAsked;
        }
        async Task MonitorRoom(CancellationToken ct)
        {
            var poll = new RoomPoll();
            while (!ct.IsCancellationRequested)
            {
                ReadConsole();
                UpdateGameState(poll);
                if (Solo && soloLifecycle.Observe(MacInstall.ClientRunning(), gate?.LastPacket, saved, DateTime.UtcNow)) return;
                if (saved && !Solo && next.TryDequeue(out var nextMode)) StartNextGame(nextMode, poll);
                if (!Solo)
                {
                    var paused = Paused;
                    if (room.Poll())
                    {
                        if (!paused && Paused) Event(State, Strings.RoomClosed);
                        if (room.Failures == 1 || room.Failures > 0 && room.Failures % 10 == 0) Info(Strings.RoomNetwork);
                    }
                }
                if (DateTime.UtcNow >= poll.RosterAt)
                {
                    EmitRoster();
                    poll.RosterAt = DateTime.UtcNow.AddSeconds(1);
                }
                await Task.Delay(250, ct);
            }
        }
        void UpdateGameState(RoomPoll poll)
        {
            CheckServer(poll.LoadAt);
            if (Ready && !poll.AutoAsked) { poll.AutoAsked = true; Event("ready", Solo ? Strings.EnterGame : HostingHint()); if (autoEnter || (game > 1 && MacInstall.ClientRunning())) Enter(); }
            ReleaseJoiningPlayers();
            if (room != null ? room.TrackServerLog("") : gameEnd.Track("")) MarkSaved();
        }
        void CheckServer(DateTime loadAt)
        {
            if (server.HasExited && !ended) throw new Exception(Strings.ServerExited);
            if (!Ready && !ended && (DateTime.UtcNow - loadAt).TotalSeconds > 180) throw new Exception(Strings.Timeout);
        }
        void ReleaseJoiningPlayers()
        {
            room?.UpdateReadiness(Ready, HostInGame, autoEnter, MacInstall.ClientRunning(), readyAt);
        }
        void StartNextGame(string nextMode, RoomPoll poll)
        {
            StopServer();
            install = MacInstall.Find();
            room.NextGame(nextMode, install.Manifest);
            mode = nextMode; Ready = false;
            // 服务器停止后才能切换地图链接，避免读取中的资源发生变化。
            mount.Dispose(); mount = install.Mount();
            Event("loading", string.Format(Strings.StartingNextGame, mode == "easy" ? Strings.Easy : mode == "hard" ? Strings.Hard : Strings.Custom));
            StartServer(); poll.LoadAt = DateTime.UtcNow; poll.AutoAsked = false;
        }
        async Task CloseRoom(bool failed, string failure)
        {
            Ready = false;
            cancel?.Cancel(); await entering;
            room?.Dispose(); gate?.Dispose(); gate = null;
            StopServer(); try { mount?.Dispose(); } catch (Exception e) { Info(Strings.MapCleanupFailed + e.Message); }
            mount = null;
            lock (logLock) { log?.Dispose(); log = null; }
            if (failed) Event("error", failure); else Event("idle", Solo ? Strings.Idle : Strings.HostIdle);
            room = null; Roster = new HostRoster(); EmitRoster();
        }
        void EmitRoster() => emit(new { type = "roster", role = Solo ? "solo" : "host", players = Roster.Snapshot().Select(e => new { key = e.Key, steamId = e.SteamId, name = e.Name, avatarUrl = e.AvatarUrl, status = (int)e.Status, host = e.IsHost }).ToArray() });
        void StartServer()
        {
            Directory.CreateDirectory(Logs); ServerLog = Path.Combine(Logs, "server-" + DateTime.Now.ToString("yyyyMMdd-HHmmss") + "-" + game + ".log");
            lock (logLock) { log?.Dispose(); log = new StreamWriter(ServerLog) { AutoFlush = true }; }
            consolePath = Path.Combine(install.Game, "dota", "windymac-" + Guid.NewGuid().ToString("N") + ".log"); consolePending = ""; signon = new ClientSignon();
            dedicated = new DedicatedBundle(install);
            var pi = new ProcessStartInfo(dedicated.Exe) { WorkingDirectory = install.Game, UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true };
            pi.Environment["SteamAppId"] = "570"; pi.Environment["DYLD_LIBRARY_PATH"] = Path.Combine(install.Game, "bin/osx64");
            foreach (var a in new[] { "-dedicated", "-game", Path.Combine(install.Game, "dota"), "-console", "-con_logfile", Path.GetFileName(consolePath), "-allow_no_lobby_connect", "-ip", "127.0.0.1", "-port", "27015", "+sv_hibernate_when_empty", "0", "+dota_quit_after_game", "0", "+net_limit_sv_message_process_time_ms_drop_burst", "2000", "+net_limit_sv_message_process_time_ms_drop_rate", "200", "+hostname", Solo ? "windy10v10ai-solo" : "windy10v10ai-room", "+map " + (mode == "easy" ? "dota" : mode) + " gamemode=15 customgamemode=" + install.SelectedMapId + " nomapvalidation=1" }) pi.ArgumentList.Add(a);
            server = new Process { StartInfo = pi }; server.OutputDataReceived += (_, e) => RawLine(e.Data); server.ErrorDataReceived += (_, e) => RawLine(e.Data);
            server.Start(); server.BeginOutputReadLine(); server.BeginErrorReadLine();
        }
        void RawLine(string line) { if (line != null) lock (logLock) log?.WriteLine(line); }
        void ReadConsole()
        {
            if (consolePath == null) return;
            if (consoleReader == null) { if (!File.Exists(consolePath)) return; consoleReader = new StreamReader(new FileStream(consolePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite)); }
            consolePending += consoleReader.ReadToEnd(); int at;
            while ((at = consolePending.IndexOf('\n')) >= 0) { var line = consolePending.Substring(0, at); consolePending = consolePending.Substring(at + 1); ServerLine(line); }
        }
        void ServerLine(string line)
        {
            if (line == null) return;
            if (line.Contains("Host activate: Loading (")) { readyAt = DateTime.UtcNow; Ready = true; }
            if (line.Contains("DOTA_GAMERULES_STATE_HERO_SELECTION")) Event("playing", Strings.InGame);
            var entered = signon.Entered(line);
            var left = signon.Left(line);
            if (left != null) foreach (var player in Roster.Snapshot().Where(e => e.SteamId == left.Value - 76561197960265728)) Roster.SetStatus(player.Key, PlayerStatus.InRoom);
            if (entered != null) { Roster.SetInGame(entered.Value); emit(new { type = "playerConnected", hostInGame = HostInGame }); }
            var wasEnded = ended;
            if (room != null ? room.TrackServerLog(line) : gameEnd.Track(line))
            {
                if (!wasEnded) Event("saving", Strings.SavingResults);
                if (saved) MarkSaved();
            }
        }
        void MarkSaved() { if (room == null) Roster.SetAll(PlayerStatus.InRoom); Event("ended", Solo ? Strings.GameEnded : Strings.NextGamePick); }
        void StopServer()
        {
            var p = server; server = null; if (p == null) { dedicated?.Dispose(); dedicated = null; return; }
            try
            {
                if (!p.HasExited)
                {
                    // 先请求服务器正常退出，使其有机会关闭网络连接和日志。
                    using var kill = Process.Start(new ProcessStartInfo("/bin/kill") { ArgumentList = { "-TERM", p.Id.ToString() }, UseShellExecute = false }); kill.WaitForExit();
                    if (!p.WaitForExit(5000)) p.Kill();
                }
                p.WaitForExit();
            }
            catch { }
            finally { p.Dispose(); consoleReader?.Dispose(); consoleReader = null; if (consolePath != null) try { File.Delete(consolePath); } catch { } consolePath = null; dedicated?.Dispose(); dedicated = null; }
        }
        sealed class MapOutdatedException : Exception { }
    }
}
