using System;
using System.Collections.Generic;
using System.Threading;

namespace Windy10v10AI.Launcher
{
    sealed class HostRoomSession : IDisposable
    {
        readonly object sync = new object(), requestLock = new object();
        readonly Func<Dictionary<string, object>, Dictionary<string, object>> request;
        readonly Func<DateTime> now;
        readonly HashSet<string> seen = new HashSet<string>();
        readonly HashSet<long> kicked = new HashSet<long>();
        readonly List<Dictionary<string, object>> results = new List<Dictionary<string, object>>();
        readonly List<Dictionary<string, object>> checks = new List<Dictionary<string, object>>();
        readonly List<Dictionary<string, object>> quality = new List<Dictionary<string, object>>();
        readonly GameEnd end = new GameEnd();
        Dictionary<string, object> peer;
        List<RelayLeg> relays = new List<RelayLeg>();
        RosterServer rosterServer;
        string code, token, map = "easy";
        int game = 1, maxPlayers = 10, generation;
        bool publicRoom, started, paused, closed, networkStarted, polling;
        DateTime openedAt, qualityAt, nextPollAt;
        DateTime? startedAt;
        int failures;
        public readonly HostTunnel Tunnel;
        public readonly HostRoster Roster;
        public event Action ConnectionFailed;
        public string Code { get { lock (sync) return code; } }
        public string Map { get { lock (sync) return map; } set { lock (sync) map = value; } }
        public int Game { get { lock (sync) return game; } }
        public bool Started { get { lock (sync) return started; } }
        public bool Ended { get { lock (sync) return end.Ended; } }
        public bool Saved { get { lock (sync) return end.Saved; } }
        public bool Paused { get { lock (sync) return paused; } }
        public bool PublicRoom { get { lock (sync) return publicRoom; } }
        public int MaxPlayers { get { lock (sync) return maxPlayers; } }
        public DateTime? StartedAt { get { lock (sync) return startedAt; } }
        public DateTime NextPollAt { get { lock (sync) return nextPollAt; } }
        public int Failures { get { lock (sync) return failures; } }

        public HostRoomSession(HostTunnel tunnel, HostRoster roster) : this(tunnel, roster, RoomApi.Host, () => DateTime.UtcNow) { }
        internal HostRoomSession(HostTunnel tunnel, HostRoster roster, Func<Dictionary<string, object>, Dictionary<string, object>> request, Func<DateTime> now)
        {
            Tunnel = tunnel; Roster = roster; this.request = request; this.now = now;
            openedAt = qualityAt = nextPollAt = now();
            Tunnel.GameReady = false; Tunnel.RosterSource = Roster.Snapshot;
            Tunnel.JoinFinished += Joined; Tunnel.JoinLeft += Left; Tunnel.GameTraffic += Roster.SetEntering;
        }
        public void Configure(bool isPublic, int capacity)
        {
            if (capacity < 2 || capacity > 10 || capacity < Roster.ActiveCount()) throw new Exception(Strings.InvalidPlayerLimit);
            lock (sync) { publicRoom = isPublic; maxPlayers = capacity; }
        }
        public Dictionary<string, object> Open(Dictionary<string, object> peerBody, long accountId, bool autoEnter)
        {
            Dictionary<string, object> body;
            lock (sync)
            {
                if (closed || peer != null) throw new InvalidOperationException();
                peer = new Dictionary<string, object>(peerBody); body = Body();
            }
            lock (requestLock)
            {
                lock (sync) { if (closed) throw new OperationCanceledException(); }
                var opened = request(body);
                lock (sync)
                {
                    code = (string)opened["code"]; token = (string)opened["token"];
                    if (closed) throw new OperationCanceledException();
                    Roster.Add(new RosterEntry { SteamId = accountId, Key = "host", Name = Field(opened, "personaName") ?? Strings.TagHost, AvatarUrl = Field(opened, "avatarUrl"), IsHost = true, Status = autoEnter ? PlayerStatus.Loading : PlayerStatus.InRoom });
                    nextPollAt = now();
                }
                return opened;
            }
        }
        public void StartNetwork(Dictionary<string, object> opened)
        {
            lock (sync)
            {
                if (closed || networkStarted) return;
                networkStarted = true; Tunnel.Start();
                rosterServer = new RosterServer(Roster.Snapshot, () => MaxPlayers); rosterServer.Start();
            }
            var addresses = RelayTicket.ReadAddresses(opened, "relayAddresses", "relayAddress");
            if (addresses.Count == 0) return;
            new Thread(() =>
            {
                var legs = new List<RelayLeg>();
                foreach (var address in addresses)
                {
                    lock (sync) { if (closed) return; }
                    legs.Add(new RelayLeg(address) { Quality = Tunnel.MeasureRelay(address) });
                }
                lock (sync) { if (!closed) relays = legs; }
            })
            { IsBackground = true }.Start();
        }
        public void Kick(string key)
        {
            var entry = Roster.Find(key);
            if (entry == null || entry.IsHost) return;
            lock (sync) { if (entry.SteamId != 0) kicked.Add(entry.SteamId); }
            Tunnel.Kick(key); Roster.Remove(key);
        }
        public bool TrackServerLog(string text)
        {
            lock (sync)
            {
                if (closed) return false;
                if (!started && text.Contains("DOTA_GAMERULES_STATE_HERO_SELECTION")) { started = true; startedAt = now(); }
                if (!end.Track(text, now())) return false;
                Tunnel.GameEnded = end.Ended;
                if (end.Saved) Roster.SetAll(PlayerStatus.InRoom);
                return true;
            }
        }
        public void UpdateReadiness(bool ready, bool hostInGame, bool autoEnter, bool clientRunning, DateTime readyAt)
        {
            lock (sync)
            {
                if (closed || end.Ended || Tunnel.GameReady || !ready) return;
                if (hostInGame || (!autoEnter && !clientRunning) || (now() - readyAt).TotalSeconds >= 30) Tunnel.GameReady = true;
            }
        }
        public void NextGame(string nextMap, string mapVersion)
        {
            lock (sync)
            {
                if (!end.Saved) throw new Exception(Strings.WaitForResults);
                if (closed) throw new OperationCanceledException();
                generation++; map = nextMap; peer["mapVersion"] = mapVersion; game++;
                started = paused = false; startedAt = null; end.Reset();
                Tunnel.GameReady = false; Tunnel.GameEnded = false; Tunnel.Game = game; Roster.SetAll(PlayerStatus.Waiting);
                openedAt = qualityAt = now(); nextPollAt = DateTime.MinValue;
            }
        }
        public void Reopen()
        {
            lock (sync) { if (closed) return; paused = false; openedAt = now(); nextPollAt = DateTime.MinValue; }
        }
        public bool Poll()
        {
            Dictionary<string, object> body;
            int version, resultCount, checkCount, qualityCount;
            bool pause;
            lock (sync)
            {
                var time = now();
                if (closed || code == null || paused || polling || time < nextPollAt) return false;
                polling = true;
                pause = !started && time - openedAt >= PauseAfter();
                if (pause) { paused = true; body = Body(); body["public"] = false; }
                else
                {
                    nextPollAt = time.AddSeconds(started ? 60 : (time - openedAt).TotalMinutes < 5 ? 2 : 5);
                    checks.AddRange(Tunnel.TakeRouteChecks()); Trim(checks);
                    if (!started) { Tunnel.TakeQuality(); qualityAt = time; }
                    else if ((time - qualityAt).TotalSeconds >= 300) { quality.AddRange(Tunnel.TakeQuality()); qualityAt = time; Trim(quality); }
                    body = Body(); body["results"] = results.ToArray(); body["routeChecks"] = checks.ToArray(); body["quality"] = quality.ToArray();
                }
                version = generation; resultCount = results.Count; checkCount = checks.Count; qualityCount = quality.Count;
            }
            try
            {
                Dictionary<string, object> answer;
                lock (requestLock)
                {
                    lock (sync) { if (closed || version != generation) return false; }
                    answer = request(body);
                }
                lock (sync)
                {
                    if (closed || version != generation || pause) return true;
                    results.RemoveRange(0, resultCount); checks.RemoveRange(0, checkCount); quality.RemoveRange(0, qualityCount); failures = 0;
                    foreach (Dictionary<string, object> join in (object[])answer["joins"]) AddJoin(join);
                }
            }
            catch (Exception) { lock (sync) { if (!closed && version == generation && !pause) failures++; } }
            finally { lock (sync) polling = false; }
            return true;
        }
        public Dictionary<string, object> Snapshot() { lock (sync) return Body(); }
        Dictionary<string, object> Body()
        {
            var body = peer == null ? new Dictionary<string, object>() : new Dictionary<string, object>(peer);
            body["public"] = publicRoom; body["maxPlayers"] = maxPlayers; body["map"] = map; body["playerCount"] = Math.Max(1, Roster.ActiveCount());
            var guests = new List<long>();
            foreach (var entry in Roster.Snapshot()) if (!entry.IsHost && entry.SteamId != 0 && entry.Status != PlayerStatus.Left && entry.Status != PlayerStatus.Failed) guests.Add(entry.SteamId);
            body["players"] = guests.ToArray(); body["game"] = game; body["started"] = started; body["ended"] = end.Ended;
            var excluded = new long[kicked.Count]; kicked.CopyTo(excluded); body["kickedSteamIds"] = excluded;
            if (code != null) { body["code"] = code; body["token"] = token; }
            RoomPeer.AddRelays(body, relays); return body;
        }
        void AddJoin(Dictionary<string, object> join)
        {
            var id = (string)join["joinId"]; if (!seen.Add(id)) return;
            object value;
            var probe = join.TryGetValue("probe", out value) && true.Equals(value);
            var steamId = join.TryGetValue("steamId", out value) && value != null ? Convert.ToInt64(value) : 0;
            if (!probe && kicked.Contains(steamId)) return;
            if (!probe) Roster.Add(new RosterEntry { Key = id, SteamId = steamId, Name = Field(join, "personaName") ?? Strings.Player, AvatarUrl = Field(join, "avatarUrl"), Status = PlayerStatus.Connecting });
            var peers = new List<Candidate>();
            foreach (string candidate in (object[])join["candidates"]) peers.Add(Candidate.Parse(candidate));
            Tunnel.AddJoin(id, (string)join["joinToken"], peers, probe, RelayTicket.Read(join));
        }
        void Joined(string id, string path, string relay, int elapsedMs)
        {
            lock (sync)
            {
                if (closed) return;
                var result = new Dictionary<string, object> { { "joinId", id }, { "elapsedMs", elapsedMs } };
                if (path != null) result["path"] = path;
                if (relay != null) result["relayAddress"] = relay;
                results.Add(result); Roster.SetStatus(id, path == null ? PlayerStatus.Failed : PlayerStatus.Loading);
            }
            var handler = ConnectionFailed; if (path == null && handler != null) handler();
        }
        void Left(string id) { Roster.SetStatus(id, PlayerStatus.Left); }
        static void Trim(List<Dictionary<string, object>> items) { if (items.Count > 50) items.RemoveRange(0, items.Count - 50); }
        static string Field(Dictionary<string, object> body, string key) { object value; return body.TryGetValue(key, out value) ? value as string : null; }
        static TimeSpan PauseAfter()
        {
            int seconds;
            return int.TryParse(Environment.GetEnvironmentVariable("WINDY_ROOM_PAUSE_SECONDS"), out seconds) && seconds > 0 ? TimeSpan.FromSeconds(seconds) : TimeSpan.FromMinutes(15);
        }
        public void Close()
        {
            Dictionary<string, object> body = null;
            lock (sync)
            {
                if (closed) return; closed = true; generation++;
            }
            // 最后的隐藏请求必须排在在途心跳之后，避免已关闭房间重新出现在列表。
            lock (requestLock)
            {
                lock (sync) { if (code != null) { body = Body(); body["public"] = false; body["started"] = true; body["ended"] = true; } }
                if (body != null) try { request(body); } catch (Exception) { }
            }
            Tunnel.JoinFinished -= Joined; Tunnel.JoinLeft -= Left; Tunnel.GameTraffic -= Roster.SetEntering;
            if (rosterServer != null) rosterServer.Dispose();
            Tunnel.Dispose();
        }
        public void Dispose() { Close(); }
    }
}
