// GPL-3.0.
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text.RegularExpressions;
namespace Windy10v10AI.Launcher
{
    sealed class HostSession
    {
        public static readonly string Logs = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Library/Logs/WindyMac");
        public HostRoster Roster { get; private set; } = new();
        public HostTunnel Tunnel { get; private set; }
        public string Code { get; private set; }
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
        RosterServer rosterServer;
        IDisposable mount;
        DedicatedBundle dedicated;
        Task entering = Task.CompletedTask;
        MacInstall install;
        Dictionary<string, object> body;
        string token, mode, lastMessage;
        int maxPlayers, game;
        bool started;
        readonly GameEnd gameEnd = new();
        bool ended => gameEnd.Ended;
        bool saved => gameEnd.Saved;
        DateTime readyAt;
        bool autoEnter;
        public bool Solo { get; private set; }
        public bool PublicRoom { get; private set; }
        public bool Saving => ended && !saved;
        public int MaxPlayers => maxPlayers;
        public string Difficulty => mode;
        public bool Paused { get; private set; }
        DateTime roomOpenedAt;
        readonly ConcurrentDictionary<long, byte> kicked = new();
        readonly SoloLifecycle soloLifecycle = new();
        StreamWriter log;
        string consolePath, consolePending = ""; StreamReader consoleReader;
        ClientSignon signon = new();
        public bool LocalTestSkipLatestCheck { get; init; }
        readonly ConcurrentQueue<Dictionary<string, object>> results = new();
        readonly ConcurrentQueue<string> next = new();
        readonly HashSet<string> seen = new();
        List<RelayLeg> relays = new();
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
            if (count < 2 || count > 10 || count < Roster.ActiveCount()) throw new Exception(Strings.InvalidPlayerLimit);
            PublicRoom = publicRoom; maxPlayers = count;
            Event(State, State == "ready" ? HostingHint() : lastMessage);
        }
        public void Kick(string key)
        {
            if (Solo || Tunnel == null) throw new Exception(Strings.HostOnly);
            var entry = Roster.Find(key);
            if (entry == null || entry.IsHost) return;
            if (entry.SteamId != 0) kicked.TryAdd(entry.SteamId, 0);
            Tunnel.Kick(key); Roster.Remove(key); EmitRoster();
        }
        public void Reopen()
        {
            if (Solo || !Active || !Paused) return;
            Paused = false; roomOpenedAt = DateTime.UtcNow;
            Event(State, HostingHint());
        }
        string HostingHint() => PublicRoom ? Strings.PublicHostingHint : Strings.PrivateHostingHint;
        Dictionary<string, object> HostBody()
        {
            var d = new Dictionary<string, object>(body)
            {
                ["public"] = PublicRoom,
                ["maxPlayers"] = maxPlayers,
                ["map"] = mode,
                ["playerCount"] = Math.Max(1, Roster.ActiveCount()),
                ["players"] = Roster.Snapshot().Where(e => !e.IsHost && e.SteamId != 0 && e.Status != PlayerStatus.Left && e.Status != PlayerStatus.Failed).Select(e => e.SteamId).ToArray(),
                ["game"] = game,
                ["started"] = started,
                ["ended"] = ended,
                ["kickedSteamIds"] = kicked.Keys.ToArray()
            };
            if (Code != null) { d["code"] = Code; d["token"] = token; }
            var legs = RelayLeg.Encode(relays); if (legs.Count > 0) { d["relays"] = legs; d["relayRtt"] = legs[0]["rtt"]; d["relayLoss"] = legs[0]["loss"]; }
            return d;
        }
        public static Dictionary<string, object> PeerBody(MacInstall i, List<Candidate> candidates, bool? symmetric) => new()
        {
            ["steamId"] = MacInstall.AccountId(),
            ["candidates"] = candidates.Select(c => c.ToString()).ToArray(),
            ["upnp"] = false,
            ["symmetricNat"] = symmetric,
            ["protocolVersion"] = RoomApi.ProtocolVersion,
            ["launcherVersion"] = LauncherVersion.Current,
            ["mapVersion"] = i.Manifest
        };
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
                    Tunnel = new HostTunnel { GameReady = false };
                    var candidates = Tunnel.Gather(out var publicIp);
                    ct.ThrowIfCancellationRequested();
                    body = PeerBody(install, candidates, Tunnel.SymmetricNat); body["publicIp"] = publicIp;
                    OpenRoom(ct);
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
            Code = null; body = null; game = 1; Ready = false; started = false; gameEnd.Reset(); seen.Clear(); kicked.Clear(); soloLifecycle.Reset(); Paused = false; roomOpenedAt = DateTime.UtcNow;
            while (results.TryDequeue(out _)) { } while (next.TryDequeue(out _)) { }
            relays = new(); Roster = new HostRoster();
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
        void OpenRoom(CancellationToken ct)
        {
            Event("opening", Strings.OpeningRoom);
            var opened = RoomApi.Host(HostBody()); Code = (string)opened["code"]; token = (string)opened["token"];
            Roster.Add(new RosterEntry { SteamId = MacInstall.AccountId(), Key = "host", Name = Field(opened, "personaName") ?? Strings.TagHost, AvatarUrl = Field(opened, "avatarUrl"), IsHost = true, Status = autoEnter ? PlayerStatus.Loading : PlayerStatus.InRoom });
            StartRoomNetwork();
            MeasureRelays(RelayTicket.ReadAddresses(opened, "relayAddresses", "relayAddress"), ct);
        }
        void StartRoomNetwork()
        {
            Tunnel.RosterSource = Roster.Snapshot;
            Tunnel.JoinFinished += (id, path, relay, ms) =>
            {
                var r = new Dictionary<string, object> { { "joinId", id }, { "elapsedMs", ms } };
                if (path != null) r["path"] = path; if (relay != null) r["relayAddress"] = relay;
                results.Enqueue(r); Roster.SetStatus(id, path == null ? PlayerStatus.Failed : PlayerStatus.Loading);
                if (path == null) Info(Strings.ConnectFailed);
            };
            Tunnel.JoinLeft += id => Roster.SetStatus(id, PlayerStatus.Left);
            Tunnel.GameTraffic += Roster.SetEntering; Tunnel.Start();
            rosterServer = new RosterServer(Roster.Snapshot, () => maxPlayers); rosterServer.Start();
            gate = new LocalGate(27015);
        }
        void MeasureRelays(List<IPEndPoint> addresses, CancellationToken ct)
        {
            var measuring = Tunnel;
            _ = Task.Run(() => { var legs = new List<RelayLeg>(); foreach (var a in addresses) { if (ct.IsCancellationRequested) break; legs.Add(new RelayLeg(a) { Quality = measuring.MeasureRelay(a) }); } relays = legs; });
        }
        sealed class RoomPoll
        {
            public DateTime PollAt = DateTime.UtcNow, LoadAt = DateTime.UtcNow;
            public readonly List<Dictionary<string, object>> Results = new(), Checks = new();
            public DateTime QualityAt = DateTime.UtcNow;
            public readonly List<Dictionary<string, object>> Quality = new();
            public bool AutoAsked;
            public int Failures;
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
                if (!Solo && DateTime.UtcNow >= poll.PollAt) PollRoom(poll);
                await Task.Delay(250, ct);
            }
        }
        void UpdateGameState(RoomPoll poll)
        {
            CheckServer(poll.LoadAt);
            if (Ready && !poll.AutoAsked) { poll.AutoAsked = true; Event("ready", Solo ? Strings.EnterGame : HostingHint()); if (autoEnter || (game > 1 && MacInstall.ClientRunning())) Enter(); }
            ReleaseJoiningPlayers();
            if (gameEnd.Track("")) MarkSaved();
        }
        void CheckServer(DateTime loadAt)
        {
            if (server.HasExited && !ended) throw new Exception(Strings.ServerExited);
            if (!Ready && !ended && (DateTime.UtcNow - loadAt).TotalSeconds > 180) throw new Exception(Strings.Timeout);
        }
        void ReleaseJoiningPlayers()
        {
            if (Tunnel != null && !Tunnel.GameReady && Ready && (HostInGame || (!autoEnter && !MacInstall.ClientRunning()) || (DateTime.UtcNow - readyAt).TotalSeconds > 30)) Tunnel.GameReady = true;
        }
        void StartNextGame(string nextMode, RoomPoll poll)
        {
            mode = nextMode; Ready = false; started = false; gameEnd.Reset(); game++;
            Tunnel.Game = game; Tunnel.GameReady = false; Tunnel.GameEnded = false; Roster.SetAll(PlayerStatus.Waiting);
            StopServer();
            roomOpenedAt = DateTime.UtcNow; Paused = false;
            install = MacInstall.Find(); body["mapVersion"] = install.Manifest;
            // 服务器停止后才能切换地图链接，避免读取中的资源发生变化。
            mount.Dispose(); mount = install.Mount();
            Event("loading", string.Format(Strings.StartingNextGame, mode == "easy" ? Strings.Easy : mode == "hard" ? Strings.Hard : Strings.Custom)); StartServer(); poll.LoadAt = DateTime.UtcNow; poll.AutoAsked = false; poll.PollAt = DateTime.MinValue;
        }
        void PollRoom(RoomPoll poll)
        {
            poll.PollAt = DateTime.UtcNow.AddSeconds(started ? 10 : 2);
            if (Paused) return;
            if (!started && DateTime.UtcNow - roomOpenedAt >= PauseAfter())
            {
                Paused = true;
                try { var hidden = HostBody(); hidden["public"] = false; RoomApi.Host(hidden); } catch { }
                Event(State, Strings.RoomClosed);
                return;
            }
            var request = PollBody(poll);
            try
            {
                var answer = RoomApi.Host(request); poll.Results.Clear(); poll.Checks.Clear(); poll.Quality.Clear();
                poll.Failures = 0;
                foreach (Dictionary<string, object> join in (object[])answer["joins"]) AddJoin(join);
            }
            catch (Exception) { poll.Failures++; if (poll.Failures == 1 || poll.Failures % 10 == 0) Info(Strings.RoomNetwork); }
            EmitRoster();
        }
        Dictionary<string, object> PollBody(RoomPoll poll)
        {
            var request = HostBody();
            while (results.TryDequeue(out var r)) poll.Results.Add(r);
            request["results"] = poll.Results.ToArray();
            poll.Checks.AddRange(Tunnel.TakeRouteChecks()); if (poll.Checks.Count > 50) poll.Checks.RemoveRange(0, poll.Checks.Count - 50);
            request["routeChecks"] = poll.Checks.ToArray();
            if (!started) { Tunnel.TakeQuality(); poll.QualityAt = DateTime.UtcNow; }
            else if ((DateTime.UtcNow - poll.QualityAt).TotalSeconds > 60) { poll.Quality.AddRange(Tunnel.TakeQuality()); poll.QualityAt = DateTime.UtcNow; }
            if (poll.Quality.Count > 50) poll.Quality.RemoveRange(0, poll.Quality.Count - 50);
            request["quality"] = poll.Quality.ToArray();
            return request;
        }
        void AddJoin(Dictionary<string, object> join)
        {
            var id = (string)join["joinId"]; if (!seen.Add(id)) return;
            bool probe = join.TryGetValue("probe", out var pv) && true.Equals(pv);
            var steamId = Convert.ToInt64(join.GetValueOrDefault("steamId", 0));
            if (!probe && kicked.ContainsKey(steamId)) return;
            if (!probe) Roster.Add(new RosterEntry { Key = id, SteamId = steamId, Name = Field(join, "personaName") ?? Strings.Player, AvatarUrl = Field(join, "avatarUrl"), Status = PlayerStatus.Connecting });
            var peers = ((object[])join["candidates"]).Select(x => Candidate.Parse((string)x)).ToList();
            Tunnel.AddJoin(id, (string)join["joinToken"], peers, probe, RelayTicket.Read(join));
        }
        async Task CloseRoom(bool failed, string failure)
        {
            Ready = false;
            cancel?.Cancel(); await entering;
            if (Code != null && body != null) try { var d = HostBody(); d["public"] = false; d["ended"] = true; d["started"] = true; RoomApi.Host(d); } catch { }
            Tunnel?.Dispose(); Tunnel = null; gate?.Dispose(); gate = null; rosterServer?.Dispose(); rosterServer = null;
            StopServer(); try { mount?.Dispose(); } catch (Exception e) { Info(Strings.MapCleanupFailed + e.Message); }
            mount = null;
            lock (logLock) { log?.Dispose(); log = null; }
            if (failed) Event("error", failure); else Event("idle", Solo ? Strings.Idle : Strings.HostIdle);
            Code = null; Roster = new HostRoster(); EmitRoster();
        }
        static TimeSpan PauseAfter() => int.TryParse(Environment.GetEnvironmentVariable("WINDY_ROOM_PAUSE_SECONDS"), out var seconds) && seconds > 0 ? TimeSpan.FromSeconds(seconds) : TimeSpan.FromMinutes(15);
        void EmitRoster() => emit(new { type = "roster", role = Solo ? "solo" : "host", players = Roster.Snapshot().Select(e => new { key = e.Key, steamId = e.SteamId, name = e.Name, avatarUrl = e.AvatarUrl, status = (int)e.Status, host = e.IsHost }).ToArray() });
        static string Field(Dictionary<string, object> d, string k) => d.GetValueOrDefault(k) as string;
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
            if (line.Contains("DOTA_GAMERULES_STATE_HERO_SELECTION")) { started = true; Event("playing", Strings.InGame); }
            var entered = signon.Entered(line);
            var left = signon.Left(line);
            if (left != null) foreach (var player in Roster.Snapshot().Where(e => e.SteamId == left.Value - 76561197960265728)) Roster.SetStatus(player.Key, PlayerStatus.InRoom);
            if (entered != null) { Roster.SetInGame(entered.Value); emit(new { type = "playerConnected", hostInGame = HostInGame }); }
            var wasEnded = ended;
            if (gameEnd.Track(line))
            {
                if (!wasEnded) { if (Tunnel != null) Tunnel.GameEnded = true; Event("saving", Strings.SavingResults); }
                if (saved) MarkSaved();
            }
        }
        void MarkSaved() { Roster.SetAll(PlayerStatus.InRoom); Event("ended", Solo ? Strings.GameEnded : Strings.NextGamePick); }
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
