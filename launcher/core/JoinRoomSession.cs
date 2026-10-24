using System;
using System.Collections.Generic;
using System.Net.Sockets;
using System.Threading;

namespace Windy10v10AI.Launcher
{
    sealed class JoinRoomSessionOptions
    {
        public Func<JoinTunnel> CreateTunnel = () => new JoinTunnel();
        public Func<JoinTunnel, List<Candidate>> Gather = tunnel =>
        {
            bool publicIp;
            return tunnel.Gather(out publicIp);
        };
        public Func<string, Dictionary<string, object>, Dictionary<string, object>> JoinRoom = RoomApi.Join;
    }

    sealed class JoinRoomSession : IDisposable
    {
        readonly JoinRoomSessionOptions options;
        readonly object sync = new object();
        JoinTunnel tunnel;
        RoomBrowser browser;
        List<Candidate> candidates;
        List<RelayLeg> relays;
        Dictionary<string, object> answer;
        CancellationTokenRegistration registration;
        JoinLifecycle lifecycle;
        bool disposed;

        public JoinTunnel Tunnel { get { lock (sync) return tunnel; } }

        public JoinRoomSession() : this(new JoinRoomSessionOptions()) { }
        internal JoinRoomSession(JoinRoomSessionOptions options) { this.options = options; }

        public static string NormalizeCode(string code)
        {
            code = (code ?? "").Trim().ToUpperInvariant();
            if (code.Length != 6) throw new RoomError("invalid_code");
            foreach (var c in code)
                if (!(c >= 'A' && c <= 'Z') && !(c >= '0' && c <= '9')) throw new RoomError("invalid_code");
            return code;
        }

        // 复用列表探测的连接，使房主看到的地址与实际加入保持一致。
        public void Prepare(RoomBrowser source, CancellationToken cancellation)
        {
            cancellation.ThrowIfCancellationRequested();
            lock (sync)
            {
                ThrowIfDisposed();
                browser = source;
            }
            JoinTunnel current = null;
            List<Candidate> gathered = null;
            List<RelayLeg> measured = null;
            try
            {
                if (source != null)
                {
                    measured = source.OwnRelays;
                    current = source.TakeTunnel(out gathered);
                    source.Dispose();
                }
                var reused = current != null;
                if (current == null) current = options.CreateTunnel();
                lock (sync)
                {
                    ThrowIfDisposed();
                    tunnel = current;
                    browser = null;
                    // 取消必须关闭套接字，才能唤醒同步的网络探测。
                    registration = cancellation.Register(current.Dispose);
                }
                cancellation.ThrowIfCancellationRequested();
                if (!reused)
                {
                    gathered = options.Gather(current);
                    cancellation.ThrowIfCancellationRequested();
                    current.Start();
                }
                lock (sync)
                {
                    ThrowIfDisposed();
                    candidates = gathered;
                    relays = measured;
                }
            }
            catch
            {
                if (current != null) current.Dispose();
                throw;
            }
        }

        public void Open(string code, long accountId, string mapVersion, CancellationToken cancellation)
        {
            code = NormalizeCode(code);
            var current = RequireTunnel();
            cancellation.ThrowIfCancellationRequested();
            var body = RoomPeer.Body(accountId, mapVersion, candidates, current.SymmetricNat);
            RoomPeer.AddRelays(body, relays);
            var joined = options.JoinRoom(code, body);
            cancellation.ThrowIfCancellationRequested();
            lock (sync)
            {
                ThrowIfDisposed();
                answer = joined;
                var host = Profile(joined, "host");
                var self = Profile(joined, "self");
                current.Placeholder = new List<RosterEntry>
                {
                    new RosterEntry { Name = Field(host, "personaName") ?? Strings.TagHost, AvatarUrl = Field(host, "avatarUrl"), IsHost = true, Status = PlayerStatus.Connecting },
                    new RosterEntry { SteamId = accountId, Name = Field(self, "personaName") ?? Strings.Player, AvatarUrl = Field(self, "avatarUrl"), Status = PlayerStatus.Connecting }
                };
            }
        }

        public string Connect(CancellationToken cancellation)
        {
            var current = RequireTunnel();
            cancellation.ThrowIfCancellationRequested();
            var peers = new List<Candidate>();
            foreach (var peer in (object[])answer["hostCandidates"]) peers.Add(Candidate.Parse((string)peer));
            var path = current.Connect((string)answer["joinToken"], peers, RelayTicket.Read(answer));
            cancellation.ThrowIfCancellationRequested();
            if (current.Kicked) throw new RoomError("kicked_by_host");
            if (path == null) throw new RoomError("connect_failed");
            current.Thresholds = RouteThresholds.Read(answer);
            current.StartRouteCheck();
            lifecycle = new JoinLifecycle(current.Game, false);
            return path;
        }

        public void Forward(int port)
        {
            try { RequireTunnel().Forward(port); }
            catch (SocketException) { throw new RoomError("port_in_use"); }
        }

        public JoinLifecycle Observe()
        {
            lifecycle.Observe(RequireTunnel());
            return lifecycle;
        }

        JoinTunnel RequireTunnel()
        {
            lock (sync)
            {
                ThrowIfDisposed();
                if (tunnel == null) throw new InvalidOperationException("Room connection is not prepared.");
                return tunnel;
            }
        }

        void ThrowIfDisposed()
        {
            if (disposed) throw new ObjectDisposedException("JoinRoomSession");
        }

        public void Dispose()
        {
            JoinTunnel current;
            RoomBrowser source;
            lock (sync)
            {
                if (disposed) return;
                disposed = true;
                current = tunnel; tunnel = null;
                source = browser; browser = null;
            }
            registration.Dispose();
            if (current != null) current.Dispose();
            if (source != null) source.Dispose();
        }

        static Dictionary<string, object> Profile(Dictionary<string, object> data, string key)
        {
            object value;
            return data.TryGetValue(key, out value) && value is Dictionary<string, object> ? (Dictionary<string, object>)value : new Dictionary<string, object>();
        }

        static string Field(Dictionary<string, object> data, string key)
        {
            object value;
            return data.TryGetValue(key, out value) ? value as string : null;
        }

        public static string ErrorText(string code)
        {
            switch (code)
            {
                case "invalid_code": return Strings.InvalidCode;
                case "room_not_found": return Strings.RoomNotFound;
                case "room_full": return Strings.RoomFull;
                case "kicked": return Strings.KickedJoin;
                case "kicked_by_host": return Strings.KickedByHost;
                case "connect_failed": return Strings.ConnectFailed;
                case "port_in_use": return Strings.PortInUse;
                case "map_mismatch": case "map_version_mismatch": return Strings.MapMismatch;
                case "version_mismatch": case "protocol_mismatch": return Strings.VersionMismatch;
                case "network": return Strings.RoomNetwork;
                case "game_started": return Strings.GameStarted;
                default: return Strings.LaunchFailed + code;
            }
        }
    }
}
