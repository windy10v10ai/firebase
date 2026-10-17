using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;

namespace Windy10v10AI.Launcher
{
    static class Packet
    {
        public const byte Hello = 1;
        public const byte Ack = 2;
        public const byte Data = 3;
        public const byte Keepalive = 4;
        public const byte Select = 5;
        public const byte Bye = 6;
        public const byte Roster = 7;
        public const byte Kicked = 8;
        public const byte Ping = 9;
        public const byte Pong = 10;
        public const byte GameEnded = 11;
        public const byte RouteCheck = 12;
        public const byte NextGame = 13;
    }

    struct RouteQuality
    {
        public int Rtt;
        public int Loss;
        public int Samples;
    }

    static class RelayPacket
    {
        public const byte Min = 0xF0;
        public const byte Allocate = 0xF1;
        public const byte Allocated = 0xF2;
        public const byte Rejected = 0xF3;
        public const byte Claim = 0xF4;
        public const byte Claimed = 0xF5;
        public const byte Ping = 0xF6;
        public const byte Pong = 0xF7;
    }

    struct RelayQuality
    {
        public static readonly RelayQuality Unknown = new RelayQuality { Rtt = -1, Loss = -1 };
        public int Rtt;
        public int Loss;
    }

    abstract class Tunnel : IDisposable
    {
        public const int GamePort = 27015;

        protected static byte[] EncodeGame(int game, bool ready)
        {
            var payload = new byte[5];
            Array.Copy(BitConverter.GetBytes(game), payload, 4);
            payload[4] = (byte)(ready ? 1 : 0);
            return payload;
        }

        protected static bool DecodeGame(byte[] data, out int game, out bool ready)
        {
            game = 0;
            ready = false;
            if (data.Length < 6) return false;
            game = BitConverter.ToInt32(data, 1);
            ready = data[5] == 1;
            return game >= 1;
        }
        // 握手窗口需覆盖房主轮询间隔，避免房主收到请求前加入者已放弃。
        protected const int HandshakeMs = 15000;
        protected const int KeepaliveMs = 10000;
        // 超时需与游戏自身的断线判断保持协调。
        protected const int SilenceMs = 30000;
        const int HelloIntervalMs = 200;
        const int MaxLanCandidates = 6;
        const int SioUdpConnReset = -1744830452;
        const int RelayRetryMs = 500;
        // 回声采样需足够区分中继质量，同时控制测量开销。
        const int RelayProbeCount = 40;
        const int RelayProbeGapMs = 50;
        const int RelayProbeWaitMs = 1000;

        protected readonly UdpClient Socket;
        protected volatile bool Closed;
        readonly object relayClaim = new object();
        readonly object relaySync = new object();
        IPEndPoint relayWaitFrom;
        byte[] relayAnswer;
        List<KeyValuePair<byte[], long>> probeReplies;

        protected Tunnel()
        {
            Socket = new UdpClient(new IPEndPoint(IPAddress.Any, 0));
            NativeMethods.KeepPrivate(Socket.Client);
        }

        int Port { get { return ((IPEndPoint)Socket.Client.LocalEndPoint).Port; } }

        public bool? SymmetricNat;

        // STUN 与隧道共用套接字，必须在接收循环开始前完成探测。
        public List<Candidate> Gather(out bool publicIp)
        {
            var list = new List<Candidate>();
            var lans = Net.LanAddresses();
            for (var i = 0; i < lans.Count && i < MaxLanCandidates; i++) list.Add(new Candidate(PathType.Lan, new IPEndPoint(lans[i], Port)));
            var stun = Net.Stun(Socket, out SymmetricNat);
            if (stun != null) list.Add(new Candidate(PathType.Stun, stun));
            publicIp = stun != null && lans.Contains(stun.Address);
            return list;
        }

        public void Start()
        {
            new Thread(() =>
            {
                while (!Closed)
                {
                    try
                    {
                        var from = new IPEndPoint(IPAddress.Any, 0);
                        var data = Socket.Receive(ref from);
                        if (data.Length == 0) continue;
                        if (data[0] >= RelayPacket.Min) OnRelay(data, from);
                        else OnPacket(data, from);
                    }
                    catch (Exception)
                    {
                    }
                }
            }) { IsBackground = true }.Start();
        }

        protected abstract void OnPacket(byte[] data, IPEndPoint from);

        protected void Send(byte type, byte[] payload, IPEndPoint to)
        {
            var packet = new byte[payload.Length + 1];
            packet[0] = type;
            Buffer.BlockCopy(payload, 0, packet, 1, payload.Length);
            try
            {
                Socket.Send(packet, packet.Length, to);
            }
            catch (Exception)
            {
            }
        }

        protected static byte[] Payload(byte[] data)
        {
            var payload = new byte[data.Length - 1];
            Buffer.BlockCopy(data, 1, payload, 0, payload.Length);
            return payload;
        }

        protected static string ReadToken(byte[] data)
        {
            return Encoding.ASCII.GetString(data, 1, data.Length - 1);
        }
        // 中继申请会并发更新候选路径，读取时需持有锁。
        protected void Burst(string token, List<Candidate> targets, Func<bool> done)
        {
            var hello = Encoding.ASCII.GetBytes(token);
            var deadline = DateTime.UtcNow.AddMilliseconds(HandshakeMs);
            while (!Closed && DateTime.UtcNow < deadline && !done())
            {
                Candidate[] round;
                lock (targets) round = targets.ToArray();
                foreach (var target in round) Send(Packet.Hello, hello, target.EndPoint);
                Thread.Sleep(HelloIntervalMs);
            }
        }

        const int RelaySliceMs = 4000;

        // 双方以相同顺序申请中继，使同一连接的两端能够汇合。
        protected IPEndPoint ClaimRelay(RelayTicket relay, out IPEndPoint used)
        {
            used = null;
            // 中继分配响应不携带加入标识，房主必须串行申请以免响应错配。
            lock (relayClaim)
            {
                var ticket = Encoding.ASCII.GetBytes(relay.Ticket);
                var overallDeadline = DateTime.UtcNow.AddMilliseconds(HandshakeMs);
                var sliceMs = Math.Max(RelaySliceMs, HandshakeMs / relay.Addresses.Count);
                foreach (var control in relay.Addresses)
                {
                    if (Closed || DateTime.UtcNow >= overallDeadline) break;
                    var sliceDeadline = DateTime.UtcNow.AddMilliseconds(sliceMs);
                    if (sliceDeadline > overallDeadline) sliceDeadline = overallDeadline;
                    while (!Closed && DateTime.UtcNow < sliceDeadline)
                    {
                        var allocated = AskRelay(RelayPacket.Allocate, ticket, control, sliceDeadline);
                        if (allocated == null || allocated[0] != RelayPacket.Allocated || allocated.Length < 3) break;
                        var session = new IPEndPoint(control.Address, (allocated[1] << 8) | allocated[2]);
                        var claimed = AskRelay(RelayPacket.Claim, ticket, session, sliceDeadline);
                        if (claimed == null || claimed[0] == RelayPacket.Rejected) break;
                        if (claimed[0] == RelayPacket.Claimed)
                        {
                            used = control;
                            return session;
                        }
                        // 延迟响应可能属于其他连接，需要重新申请确认分配结果。
                    }
                }
                return null;
            }
        }

        public RelayQuality MeasureRelay(IPEndPoint relay)
        {
            var sent = new HashSet<long>();
            var replies = new List<KeyValuePair<byte[], long>>();
            lock (relayClaim)
            {
                lock (relaySync)
                {
                    relayWaitFrom = relay;
                    probeReplies = replies;
                }
                try
                {
                    for (var i = 0; i < RelayProbeCount && !Closed; i++)
                    {
                        var stamp = Stopwatch.GetTimestamp();
                        sent.Add(stamp);
                        Send(RelayPacket.Ping, BitConverter.GetBytes(stamp), relay);
                        Thread.Sleep(RelayProbeGapMs);
                    }
                    Thread.Sleep(RelayProbeWaitMs);
                }
                finally
                {
                    lock (relaySync)
                    {
                        relayWaitFrom = null;
                        probeReplies = null;
                    }
                }
            }
            if (sent.Count < RelayProbeCount) return RelayQuality.Unknown;
            var best = -1;
            var answered = 0;
            foreach (var reply in replies)
            {
                if (reply.Key[0] != RelayPacket.Pong || reply.Key.Length < 9) continue;
                var stamp = BitConverter.ToInt64(reply.Key, 1);
                if (!sent.Remove(stamp)) continue;
                answered++;
                var ms = (int)((reply.Value - stamp) * 1000 / Stopwatch.Frequency);
                if (best < 0 || ms < best) best = ms;
            }
            return new RelayQuality { Rtt = best, Loss = (RelayProbeCount - answered) * 100 / RelayProbeCount };
        }

        // 请求和响应均可能丢失，因此需要重复发送直至确认。
        byte[] AskRelay(byte type, byte[] ticket, IPEndPoint to, DateTime deadline)
        {
            lock (relaySync)
            {
                relayWaitFrom = to;
                relayAnswer = null;
                try
                {
                    while (!Closed && relayAnswer == null && DateTime.UtcNow < deadline)
                    {
                        Send(type, ticket, to);
                        Monitor.Wait(relaySync, RelayRetryMs);
                    }
                    return relayAnswer;
                }
                finally
                {
                    relayWaitFrom = null;
                }
            }
        }

        void OnRelay(byte[] data, IPEndPoint from)
        {
            lock (relaySync)
            {
                if (relayWaitFrom == null || !relayWaitFrom.Equals(from)) return;
                if (probeReplies != null)
                {
                    probeReplies.Add(new KeyValuePair<byte[], long>(data, Stopwatch.GetTimestamp()));
                    return;
                }
                relayAnswer = data;
                Monitor.PulseAll(relaySync);
            }
        }

        public virtual void Dispose()
        {
            Closed = true;
            Socket.Close();
        }
    }

    class HostTunnel : Tunnel
    {
        class Peer
        {
            public IPEndPoint Remote;
            public UdpClient Local;
            public DateTime LastSent;
            public DateTime LastReceived;
            public volatile bool Closed;
            // 未支持探测响应的启动器不应被误报为完全丢包。
            public bool Echoed;
            public int Sent;
            public readonly List<int> Rtts = new List<int>();
            public int TrafficGame;
        }

        // 探测令牌及时过期，避免被用于游戏连接。
        const int ProbeLingerMs = 5000;
        // 采样频率需兼顾丢包分辨率与游戏网络开销。
        const int QualityPingMs = 6000;

        readonly object sync = new object();
        readonly int gamePort;
        readonly Dictionary<string, string> joinIds = new Dictionary<string, string>();
        readonly HashSet<string> probes = new HashSet<string>();
        readonly Dictionary<string, string> paths = new Dictionary<string, string>();
        readonly Dictionary<IPEndPoint, string> verified = new Dictionary<IPEndPoint, string>();
        readonly Dictionary<string, Peer> peers = new Dictionary<string, Peer>();
        readonly Dictionary<string, string> relayUsed = new Dictionary<string, string>();
        readonly List<Dictionary<string, object>> routeChecks = new List<Dictionary<string, object>>();
        readonly Dictionary<string, string> lastRouteCheck = new Dictionary<string, string>();

        public event Action<string, string, string, int> JoinFinished;
        public event Action<string> JoinLeft;
        public event Action<string> GameTraffic;
        public Func<List<RosterEntry>> RosterSource;
        public volatile bool GameEnded;
        public volatile int Game = 1;
        public volatile bool GameReady = true;

        public HostTunnel() : this(GamePort) { }

        // 允许离线测试隔离端口，避免干扰正在运行的游戏服务器。
        internal HostTunnel(int gamePort)
        {
            this.gamePort = gamePort;
            new Thread(() =>
            {
                var lastPing = DateTime.MinValue;
                while (!Closed)
                {
                    Thread.Sleep(2000);
                    var ping = (DateTime.UtcNow - lastPing).TotalMilliseconds >= QualityPingMs;
                    if (ping) lastPing = DateTime.UtcNow;
                    var source = RosterSource;
                    var roster = source == null ? new List<RosterEntry>() : source();
                    lock (sync)
                    {
                        foreach (var peer in peers.Values)
                        {
                            // 先发送游戏状态，避免玩家在收到名单后进入错误的一局。
                            SendTo(peer, Packet.NextGame, EncodeGame(Game, GameReady));
                            // 周期性名单报文同时维持 NAT 映射。
                            for (var i = 0; i < roster.Count; i++) SendTo(peer, Packet.Roster, roster[i].Encode(i, roster.Count));
                            if (GameEnded) SendTo(peer, Packet.GameEnded, BitConverter.GetBytes(Game));
                            if (peer.Remote != null && (DateTime.UtcNow - peer.LastSent).TotalMilliseconds > KeepaliveMs) SendTo(peer, Packet.Keepalive, new byte[0]);
                            if (ping && peer.Remote != null && (DateTime.UtcNow - peer.LastReceived).TotalMilliseconds < SilenceMs)
                            {
                                SendTo(peer, Packet.Ping, BitConverter.GetBytes(Stopwatch.GetTimestamp()));
                                peer.Sent++;
                            }
                        }
                    }
                }
            }) { IsBackground = true }.Start();
        }

        public void AddJoin(string joinId, string token, List<Candidate> candidates, bool probe, RelayTicket relay)
        {
            lock (sync)
            {
                if (joinIds.ContainsKey(token)) return;
                joinIds[token] = joinId;
                if (probe) probes.Add(token);
            }
            var started = DateTime.UtcNow;
            new Thread(() =>
            {
                if (probe)
                {
                    Burst(token, candidates, () => { lock (sync) return verified.ContainsValue(token); });
                    Thread.Sleep(ProbeLingerMs);
                    lock (sync) Forget(token);
                    return;
                }
                if (relay != null)
                {
                    new Thread(() =>
                    {
                        IPEndPoint control;
                        var session = ClaimRelay(relay, out control);
                        if (session == null) return;
                        lock (sync) relayUsed[token] = control.ToString();
                        lock (candidates) candidates.Add(new Candidate(PathType.Relay, session));
                    }) { IsBackground = true }.Start();
                }
                // 失效令牌不再参与握手，防止被移除的玩家重连。
                Burst(token, candidates, () => { lock (sync) return paths.ContainsKey(token) || !joinIds.ContainsKey(token); });
                string path, relayAddress;
                bool kicked;
                lock (sync)
                {
                    paths.TryGetValue(token, out path);
                    kicked = !joinIds.ContainsKey(token);
                    relayUsed.TryGetValue(token, out relayAddress);
                }
                var handler = JoinFinished;
                if (handler != null && !Closed && !kicked) handler(joinId, path == null ? null : PathType.Report(path), path == PathType.Relay ? relayAddress : null, (int)(DateTime.UtcNow - started).TotalMilliseconds);
            }) { IsBackground = true }.Start();
        }

        public List<Dictionary<string, object>> TakeQuality()
        {
            var list = new List<Dictionary<string, object>>();
            lock (sync)
            {
                foreach (var pair in peers)
                {
                    var peer = pair.Value;
                    string joinId, path;
                    if (peer.Echoed && peer.Sent > 0 && joinIds.TryGetValue(pair.Key, out joinId) && paths.TryGetValue(pair.Key, out path))
                    {
                        var entry = new Dictionary<string, object>
                        {
                            { "joinId", joinId },
                            { "path", PathType.Report(path) },
                            { "sent", peer.Sent },
                            { "lost", Math.Max(0, peer.Sent - peer.Rtts.Count) },
                        };
                        if (peer.Rtts.Count > 0)
                        {
                            peer.Rtts.Sort();
                            entry["rttP50"] = peer.Rtts[(peer.Rtts.Count - 1) / 2];
                            entry["rttP95"] = peer.Rtts[(peer.Rtts.Count - 1) * 95 / 100];
                        }
                        string relayAddress;
                        if (path == PathType.Relay && relayUsed.TryGetValue(pair.Key, out relayAddress)) entry["relayAddress"] = relayAddress;
                        list.Add(entry);
                    }
                    peer.Sent = 0;
                    peer.Rtts.Clear();
                }
            }
            return list;
        }

        public List<Dictionary<string, object>> TakeRouteChecks()
        {
            lock (sync)
            {
                var list = new List<Dictionary<string, object>>(routeChecks);
                routeChecks.Clear();
                return list;
            }
        }

        public void Kick(string joinId)
        {
            lock (sync)
            {
                var tokens = new List<string>();
                foreach (var pair in joinIds)
                {
                    if (pair.Value == joinId) tokens.Add(pair.Key);
                }
                foreach (var token in tokens)
                {
                    var targets = new List<IPEndPoint>();
                    Peer peer;
                    if (peers.TryGetValue(token, out peer) && peer.Remote != null) targets.Add(peer.Remote);
                    foreach (var pair in verified)
                    {
                        if (pair.Value == token && !targets.Contains(pair.Key)) targets.Add(pair.Key);
                    }
                    // 结束通知需要重复发送，避免丢包导致加入者持续重连。
                    foreach (var target in targets)
                    {
                        for (var i = 0; i < 3; i++) Send(Packet.Kicked, new byte[0], target);
                    }
                    if (peer != null)
                    {
                        peer.Closed = true;
                        peer.Local.Close();
                        peers.Remove(token);
                    }
                    Forget(token);
                }
            }
        }

        void Forget(string token)
        {
            joinIds.Remove(token);
            probes.Remove(token);
            paths.Remove(token);
            relayUsed.Remove(token);
            lastRouteCheck.Remove(token);
            var stale = new List<IPEndPoint>();
            foreach (var pair in verified)
            {
                if (pair.Value == token) stale.Add(pair.Key);
            }
            foreach (var endPoint in stale) verified.Remove(endPoint);
        }

        protected override void OnPacket(byte[] data, IPEndPoint from)
        {
            lock (sync)
            {
                if (data[0] == Packet.Hello || data[0] == Packet.Ack)
                {
                    var token = ReadToken(data);
                    if (!joinIds.ContainsKey(token)) return;
                    verified[from] = token;
                    if (data[0] == Packet.Hello) Send(Packet.Ack, Encoding.ASCII.GetBytes(token), from);
                    return;
                }

                string owner;
                if (!verified.TryGetValue(from, out owner)) return;
                if (data[0] == Packet.Ping)
                {
                    Send(Packet.Pong, Payload(data), from);
                    return;
                }
                if (probes.Contains(owner)) return;
                var peer = PeerOf(owner);
                // 回复跟随最新来源地址，使重连后的线路切换能够生效。
                peer.Remote = from;
                peer.LastReceived = DateTime.UtcNow;
                if (data[0] == Packet.Select && data.Length == 2 && data[1] < PathType.Preference.Length)
                {
                    paths[owner] = PathType.Preference[data[1]];
                }
                else if (data[0] == Packet.Pong && data.Length >= 9)
                {
                    peer.Echoed = true;
                    peer.Rtts.Add((int)((Stopwatch.GetTimestamp() - BitConverter.ToInt64(data, 1)) * 1000 / Stopwatch.Frequency));
                }
                else if (data[0] == Packet.RouteCheck && data.Length == 8)
                {
                    var copy = Convert.ToBase64String(data);
                    string last;
                    if (lastRouteCheck.TryGetValue(owner, out last) && last == copy) return;
                    lastRouteCheck[owner] = copy;
                    if (data[1] >= PathType.Preference.Length) return;
                    var check = new Dictionary<string, object>
                    {
                        { "joinId", joinIds[owner] },
                        { "path", PathType.Report(PathType.Preference[data[1]]) },
                        { "directLossPct", (int)data[2] },
                        { "relayLossPct", (int)data[3] },
                    };
                    var directRtt = BitConverter.ToUInt16(data, 4);
                    var relayRtt = BitConverter.ToUInt16(data, 6);
                    if (directRtt != ushort.MaxValue) check["directRttMs"] = (int)directRtt;
                    if (relayRtt != ushort.MaxValue) check["relayRttMs"] = (int)relayRtt;
                    routeChecks.Add(check);
                }
                else if (data[0] == Packet.Bye)
                {
                    peer.LastReceived = DateTime.MinValue;
                    var left = JoinLeft;
                    if (left != null) left(joinIds[owner]);
                }
                else if (data[0] == Packet.Data)
                {
                    try
                    {
                        var payload = Payload(data);
                        peer.Local.Send(payload, payload.Length);
                    }
                    catch (Exception)
                    {
                    }
                    // 服务器就绪前的报文可能属于已结束的游戏，不能直接转发。
                    if (GameReady && peer.TrafficGame != Game)
                    {
                        peer.TrafficGame = Game;
                        var traffic = GameTraffic;
                        if (traffic != null) traffic(joinIds[owner]);
                    }
                }
            }
        }

        // 每位玩家需要独立的本地套接字，使服务器能够区分客户端。
        Peer PeerOf(string token)
        {
            Peer peer;
            if (peers.TryGetValue(token, out peer)) return peer;
            peer = new Peer { Local = new UdpClient(new IPEndPoint(IPAddress.Loopback, 0)) };
            NativeMethods.KeepPrivate(peer.Local.Client);
            peer.Local.Connect(IPAddress.Loopback, gamePort);
            peers[token] = peer;
            new Thread(() =>
            {
                while (!Closed && !peer.Closed)
                {
                    try
                    {
                        var from = new IPEndPoint(IPAddress.Any, 0);
                        var payload = peer.Local.Receive(ref from);
                        lock (sync) SendTo(peer, Packet.Data, payload);
                    }
                    catch (Exception)
                    {
                        if (Closed || peer.Closed) return;
                    }
                }
            }) { IsBackground = true }.Start();
            return peer;
        }

        void SendTo(Peer peer, byte type, byte[] payload)
        {
            if (peer.Remote == null) return;
            Send(type, payload, peer.Remote);
            peer.LastSent = DateTime.UtcNow;
        }

        public override void Dispose()
        {
            lock (sync)
            {
                foreach (var peer in peers.Values)
                {
                    for (var i = 0; i < 3; i++) SendTo(peer, Packet.Bye, new byte[0]);
                }
            }
            base.Dispose();
            lock (sync)
            {
                foreach (var peer in peers.Values) peer.Local.Close();
            }
        }
    }

    class JoinTunnel : Tunnel
    {
        // 首条路径响应后留出短暂窗口，给更快的局域网路径参与选择。
        const int SettleMs = 300;
        // 申请中继前预留打洞时间，避免可直连的玩家过早使用中继。
        const int RelayWaitMs = 3000;
        const int GiveUpMs = 90000;
        const int QuietMs = 7000;
        // 首次响应可能受打洞延迟影响，不参与延迟统计。
        const int PingSamples = 10;
        const int ProbeSettleMs = 3000;
        const int CheckMs = 10000;
        const int CheckGapMs = 50;
        // 结束测量后等待在途响应，避免将其误计为丢包。
        const int LateReplyMs = 1000;
        const int RelayReachMs = 8000;
        const int StatusWindowMs = 60000;
        const string DirectMeter = "~direct";
        const string RelayMeter = "~relay";
        const string StatusMeter = "~status";

        internal class Probe
        {
            public readonly Dictionary<IPEndPoint, List<int>> Rtts = new Dictionary<IPEndPoint, List<int>>();
            public DateTime FirstReply = DateTime.MaxValue;

            public bool Done
            {
                get
                {
                    if ((DateTime.UtcNow - FirstReply).TotalMilliseconds >= ProbeSettleMs) return true;
                    foreach (var rtts in Rtts.Values)
                    {
                        if (rtts.Count > PingSamples) return true;
                    }
                    return false;
                }
            }

            public int Rtt
            {
                get
                {
                    var best = -1;
                    foreach (var rtts in Rtts.Values)
                    {
                        var kept = rtts.Count > 1 ? rtts.GetRange(1, rtts.Count - 1) : new List<int>(rtts);
                        kept.Sort();
                        var median = kept[(kept.Count - 1) / 2];
                        if (best < 0 || median < best) best = median;
                    }
                    return best;
                }
            }
        }

        class Meter
        {
            public readonly List<long> Sent = new List<long>();
            public readonly Dictionary<long, int> Rtts = new Dictionary<long, int>();
        }

        readonly object sync = new object();
        readonly Dictionary<IPEndPoint, string> reached = new Dictionary<IPEndPoint, string>();
        readonly Dictionary<string, Probe> probes = new Dictionary<string, Probe>();
        readonly Dictionary<string, Meter> meters = new Dictionary<string, Meter>();
        string token;
        string route;
        bool checking;
        List<Candidate> hosts;
        RelayTicket relay;
        IPEndPoint host;
        UdpClient local;
        IPEndPoint dota;
        DateTime lastReceived;
        DateTime lastSent;
        DateTime? lastFromDota;

        public volatile bool Lost;
        public volatile bool Kicked;
        public volatile bool GameEnded;
        public volatile int Game = 1;
        public volatile bool GameReady = true;
        readonly Dictionary<int, RosterEntry> roster = new Dictionary<int, RosterEntry>();
        int rosterCount = -1;
        public List<RosterEntry> Placeholder = new List<RosterEntry>();
        public static bool RelayOnly;
        public RouteThresholds Thresholds;

        public bool Checking
        {
            get { lock (sync) return checking; }
        }

        public string Connect(string joinToken, List<Candidate> hostCandidates, RelayTicket relayTicket)
        {
            lock (sync)
            {
                token = joinToken;
                hosts = RelayOnly ? new List<Candidate>() : hostCandidates;
                relay = relayTicket;
            }
            return Handshake();
        }

        // 探测与加入共用套接字，确保 NAT 映射能够复用。
        public int Measure(string probeToken, List<Candidate> hostCandidates)
        {
            var probe = new Probe();
            lock (sync) probes[probeToken] = probe;
            Burst(probeToken, hostCandidates, () => { lock (sync) return probe.Done; });
            lock (sync)
            {
                probes.Remove(probeToken);
                return probe.Rtt;
            }
        }

        long SendPing(string probeToken, IPEndPoint to)
        {
            var now = Stopwatch.GetTimestamp();
            var stamp = BitConverter.GetBytes(now);
            var id = Encoding.ASCII.GetBytes(probeToken);
            var payload = new byte[stamp.Length + id.Length];
            Buffer.BlockCopy(stamp, 0, payload, 0, stamp.Length);
            Buffer.BlockCopy(id, 0, payload, stamp.Length, id.Length);
            Send(Packet.Ping, payload, to);
            return now;
        }

        void OnPong(byte[] data, IPEndPoint from)
        {
            if (data.Length < 9) return;
            var id = Encoding.ASCII.GetString(data, 9, data.Length - 9);
            var sent = BitConverter.ToInt64(data, 1);
            var ms = (int)((Stopwatch.GetTimestamp() - sent) * 1000 / Stopwatch.Frequency);
            Meter meter;
            if (meters.TryGetValue(id, out meter))
            {
                meter.Rtts[sent] = ms;
                return;
            }
            Probe probe;
            if (!probes.TryGetValue(id, out probe)) return;
            List<int> rtts;
            if (!probe.Rtts.TryGetValue(from, out rtts)) probe.Rtts[from] = rtts = new List<int>();
            rtts.Add(ms);
            if (probe.FirstReply == DateTime.MaxValue) probe.FirstReply = DateTime.UtcNow;
        }

        string Handshake()
        {
            lock (sync)
            {
                reached.Clear();
                host = null;
            }
            // 每次握手重新申请中继，使来源地址变化后的重连仍可到达。
            if (relay != null)
            {
                var ticket = relay;
                new Thread(() =>
                {
                    IPEndPoint control;
                    var session = ClaimRelay(ticket, out control);
                    if (session == null) return;
                    lock (sync)
                    lock (hosts)
                    {
                        hosts.RemoveAll(c => c.Type == PathType.Relay);
                        hosts.Add(new Candidate(PathType.Relay, session));
                    }
                }) { IsBackground = true }.Start();
            }
            var started = DateTime.UtcNow;
            var firstDirect = DateTime.MaxValue;
            Burst(token, hosts, () =>
            {
                lock (sync)
                {
                    if (Kicked || reached.ContainsValue(PathType.Lan)) return true;
                    var now = DateTime.UtcNow;
                    foreach (var type in reached.Values)
                    {
                        if (type != PathType.Relay && firstDirect == DateTime.MaxValue) firstDirect = now;
                    }
                    if ((now - firstDirect).TotalMilliseconds >= SettleMs) return true;
                    return reached.ContainsValue(PathType.Relay) && (now - started).TotalMilliseconds >= RelayWaitMs;
                }
            });

            lock (sync)
            {
                foreach (var type in PathType.Preference)
                {
                    foreach (var pair in reached)
                    {
                        if (pair.Value != type) continue;
                        host = pair.Key;
                        route = type;
                        meters.Remove(StatusMeter);
                        lastReceived = DateTime.UtcNow;
                        var index = new[] { (byte)Array.IndexOf(PathType.Preference, type) };
                        for (var i = 0; i < 3; i++) Send(Packet.Select, index, host);
                        lastSent = DateTime.UtcNow;
                        return type;
                    }
                }
            }
            return null;
        }

        public bool HasRoster
        {
            get { lock (sync) return rosterCount >= 0; }
        }

        public List<RosterEntry> Roster()
        {
            lock (sync)
            {
                if (rosterCount < 0) return Placeholder;
                var list = new List<RosterEntry>();
                for (var i = 0; i < rosterCount; i++)
                {
                    RosterEntry entry;
                    if (roster.TryGetValue(i, out entry)) list.Add(entry);
                }
                return list;
            }
        }

        public bool Silent
        {
            get { lock (sync) return host != null && (DateTime.UtcNow - lastReceived).TotalMilliseconds > QuietMs; }
        }

        public DateTime? LastDotaPacket
        {
            get { lock (sync) return lastFromDota; }
        }

        public void Forward() { Forward(LocalGate.Port); }

        internal void Forward(int listenPort)
        {
            local = new UdpClient(new IPEndPoint(IPAddress.Loopback, listenPort));
            NativeMethods.KeepPrivate(local.Client);
            new Thread(() =>
            {
                while (!Closed)
                {
                    try
                    {
                        var from = new IPEndPoint(IPAddress.Any, 0);
                        var payload = local.Receive(ref from);
                        if (SteamQuery.IsQuery(payload))
                        {
                            SteamQuery.Reply(local, payload, from);
                            continue;
                        }
                        lock (sync)
                        {
                            dota = from;
                            lastFromDota = DateTime.UtcNow;
                            if (host == null) continue;
                            Send(Packet.Data, payload, host);
                            lastSent = DateTime.UtcNow;
                        }
                    }
                    catch (Exception)
                    {
                        if (Closed) return;
                    }
                }
            }) { IsBackground = true }.Start();

            new Thread(Watch) { IsBackground = true }.Start();
        }

        void Watch()
        {
            var silentSince = DateTime.MaxValue;
            while (!Closed)
            {
                Thread.Sleep(1000);
                bool silent;
                lock (sync)
                {
                    if (host != null && (DateTime.UtcNow - lastSent).TotalMilliseconds > KeepaliveMs)
                    {
                        Send(Packet.Keepalive, new byte[0], host);
                        lastSent = DateTime.UtcNow;
                    }
                    if (host != null) Ping(StatusMeter, host);
                    silent = (DateTime.UtcNow - lastReceived).TotalMilliseconds > SilenceMs;
                }
                if (!silent)
                {
                    silentSince = DateTime.MaxValue;
                    continue;
                }
                if (silentSince == DateTime.MaxValue) silentSince = DateTime.UtcNow;
                if ((DateTime.UtcNow - silentSince).TotalMilliseconds > GiveUpMs)
                {
                    Lost = true;
                    return;
                }
                // 有效令牌允许直接重建路径，避免重连依赖房间服务。
                if (Handshake() != null) StartRouteCheck();
            }
        }

        public void StartRouteCheck()
        {
            new Thread(CheckRoute) { IsBackground = true }.Start();
        }

        void CheckRoute()
        {
            IPEndPoint direct;
            var limits = Thresholds;
            lock (sync)
            {
                if (limits == null || relay == null || checking || host == null || route == PathType.Lan || route == PathType.Relay) return;
                direct = host;
                checking = true;
            }
            try
            {
                var relayEnd = ReachRelay();
                if (relayEnd == null) return;
                lock (sync)
                {
                    meters[DirectMeter] = new Meter();
                    meters[RelayMeter] = new Meter();
                }
                var until = DateTime.UtcNow.AddMilliseconds(CheckMs);
                while (!Closed && DateTime.UtcNow < until)
                {
                    Ping(DirectMeter, direct);
                    Ping(RelayMeter, relayEnd);
                    Thread.Sleep(CheckGapMs);
                }
                Thread.Sleep(LateReplyMs);
                lock (sync)
                {
                    var directQuality = Measure(meters[DirectMeter], 0);
                    var relayQuality = Measure(meters[RelayMeter], 0);
                    if (Closed || !direct.Equals(host)) return;
                    if (limits.PrefersRelay(directQuality, relayQuality))
                    {
                        host = relayEnd;
                        route = PathType.Relay;
                        var index = new[] { (byte)Array.IndexOf(PathType.Preference, PathType.Relay) };
                        for (var i = 0; i < 3; i++) Send(Packet.Select, index, host);
                        lastSent = DateTime.UtcNow;
                    }
                    // 线路检查样本更密集，统计窗口需覆盖这些样本。
                    meters[StatusMeter] = route == PathType.Relay ? meters[RelayMeter] : meters[DirectMeter];
                    var report = new byte[7];
                    report[0] = (byte)Array.IndexOf(PathType.Preference, route);
                    report[1] = (byte)directQuality.Loss;
                    report[2] = (byte)relayQuality.Loss;
                    Buffer.BlockCopy(BitConverter.GetBytes(Rtt16(directQuality)), 0, report, 3, 2);
                    Buffer.BlockCopy(BitConverter.GetBytes(Rtt16(relayQuality)), 0, report, 5, 2);
                    // 重复发送降低丢包影响，房主会去除重复报告。
                    for (var i = 0; i < 3; i++) Send(Packet.RouteCheck, report, host);
                }
            }
            finally
            {
                lock (sync)
                {
                    meters.Remove(DirectMeter);
                    meters.Remove(RelayMeter);
                    checking = false;
                }
            }
        }

        static ushort Rtt16(RouteQuality quality)
        {
            return quality.Rtt < 0 ? ushort.MaxValue : (ushort)Math.Min(quality.Rtt, ushort.MaxValue - 1);
        }

        IPEndPoint ReachRelay()
        {
            byte[] hello;
            lock (sync) hello = Encoding.ASCII.GetBytes(token);
            var deadline = DateTime.UtcNow.AddMilliseconds(RelayReachMs);
            while (!Closed && DateTime.UtcNow < deadline)
            {
                IPEndPoint relayEnd = null;
                lock (hosts)
                {
                    foreach (var candidate in hosts)
                    {
                        if (candidate.Type == PathType.Relay) relayEnd = candidate.EndPoint;
                    }
                }
                if (relayEnd != null)
                {
                    lock (sync)
                    {
                        if (reached.ContainsKey(relayEnd)) return relayEnd;
                    }
                    Send(Packet.Hello, hello, relayEnd);
                }
                Thread.Sleep(200);
            }
            return null;
        }

        void Ping(string meterId, IPEndPoint to)
        {
            lock (sync)
            {
                Meter meter;
                if (!meters.TryGetValue(meterId, out meter)) meters[meterId] = meter = new Meter();
                meter.Sent.Add(SendPing(meterId, to));
            }
        }

        // 最近发送的探测仍可能在途，不应计入丢包统计。
        static RouteQuality Measure(Meter meter, int windowMs)
        {
            var now = Stopwatch.GetTimestamp();
            var newest = windowMs == 0 ? long.MaxValue : now - Stopwatch.Frequency * LateReplyMs / 1000;
            if (windowMs > 0)
            {
                var oldest = now - Stopwatch.Frequency * windowMs / 1000;
                meter.Sent.RemoveAll(stamp =>
                {
                    if (stamp >= oldest) return false;
                    meter.Rtts.Remove(stamp);
                    return true;
                });
            }
            var rtts = new List<int>();
            var counted = 0;
            foreach (var stamp in meter.Sent)
            {
                if (stamp > newest) continue;
                counted++;
                int rtt;
                if (meter.Rtts.TryGetValue(stamp, out rtt)) rtts.Add(rtt);
            }
            if (counted == 0) return new RouteQuality { Rtt = -1 };
            rtts.Sort();
            return new RouteQuality
            {
                Rtt = rtts.Count == 0 ? -1 : rtts[(rtts.Count - 1) / 2],
                Loss = (counted - rtts.Count) * 100 / counted,
                Samples = counted,
            };
        }

        public RouteQuality Status(out string path)
        {
            lock (sync)
            {
                path = route;
                Meter meter;
                return meters.TryGetValue(StatusMeter, out meter) ? Measure(meter, StatusWindowMs) : new RouteQuality { Rtt = -1 };
            }
        }

        protected override void OnPacket(byte[] data, IPEndPoint from)
        {
            lock (sync)
            {
                if (data[0] == Packet.Hello || data[0] == Packet.Ack)
                {
                    var received = ReadToken(data);
                    var joining = token != null && received == token;
                    if (!joining && !probes.ContainsKey(received)) return;
                    // 强制中继测试需忽略直连握手，避免绕过待测路径。
                    if (joining && RelayOnly && TypeOf(from) != PathType.Relay) return;
                    if (data[0] == Packet.Hello) Send(Packet.Ack, Encoding.ASCII.GetBytes(received), from);
                    if (joining)
                    {
                        if (!reached.ContainsKey(from)) reached[from] = TypeOf(from);
                    }
                    else SendPing(received, from);
                    return;
                }
                if (data[0] == Packet.Pong)
                {
                    OnPong(data, from);
                    return;
                }
                if (data[0] == Packet.Kicked && (from.Equals(host) || reached.ContainsKey(from)))
                {
                    Kicked = true;
                    Lost = true;
                    return;
                }
                if (host == null || !from.Equals(host)) return;
                if (data[0] == Packet.Bye)
                {
                    Lost = true;
                    return;
                }
                lastReceived = DateTime.UtcNow;
                if (data[0] == Packet.Ping)
                {
                    Send(Packet.Pong, Payload(data), from);
                    return;
                }
                if (data[0] == Packet.GameEnded)
                {
                    // 游戏编号用于过滤跨局延迟报文，同时保留对缺失编号的兼容。
                    if (data.Length >= 5 && BitConverter.ToInt32(data, 1) < Game) return;
                    GameEnded = true;
                    return;
                }
                if (data[0] == Packet.NextGame)
                {
                    int game;
                    bool ready;
                    if (!DecodeGame(data, out game, out ready) || game < Game) return;
                    if (game > Game)
                    {
                        Game = game;
                        GameEnded = false;
                    }
                    GameReady = ready;
                    return;
                }
                if (data[0] == Packet.Roster)
                {
                    try
                    {
                        int index, count;
                        var entry = RosterEntry.Decode(data, 1, out index, out count);
                        if (count != rosterCount)
                        {
                            roster.Clear();
                            rosterCount = count;
                        }
                        roster[index] = entry;
                    }
                    catch (Exception)
                    {
                    }
                    return;
                }
                if (data[0] == Packet.Data && dota != null)
                {
                    try
                    {
                        var payload = Payload(data);
                        local.Send(payload, payload.Length, dota);
                    }
                    catch (Exception)
                    {
                    }
                }
            }
        }

        string TypeOf(IPEndPoint from)
        {
            foreach (var candidate in hosts)
            {
                if (candidate.EndPoint.Equals(from)) return candidate.Type;
            }
            return PathType.Stun;
        }

        public override void Dispose()
        {
            lock (sync)
            {
                if (host != null && !Closed)
                {
                    for (var i = 0; i < 3; i++) Send(Packet.Bye, new byte[0], host);
                }
            }
            base.Dispose();
            if (local != null) local.Close();
        }
    }
}
