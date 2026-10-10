using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;

namespace Windy10v10AI.Launcher
{
    // One type byte, then the join token for handshakes, the path index for Select, or the Dota payload for Data
    static class Packet
    {
        public const byte Hello = 1;
        public const byte Ack = 2;
        public const byte Data = 3;
        public const byte Keepalive = 4;
        public const byte Select = 5;
        // Sent when either side stops on purpose, so the other side does not wait for a timeout
        public const byte Bye = 6;
        // One player of the host's roster, so joiners see the same list as the host
        public const byte Roster = 7;
        // Tells a joiner the host removed it, so it stops reconnecting with a token the host has dropped
        public const byte Kicked = 8;
        // A timestamp and token the host echoes back unchanged, so the joiner measures the round trip on its own clock
        public const byte Ping = 9;
        public const byte Pong = 10;
        // Only the host reads the server log, so joiners learn from it that the game is over; older launchers ignore it
        public const byte GameEnded = 11;
        // The joiner's measurement of the direct route against the relay, which the host passes on to the API; older launchers ignore it
        public const byte RouteCheck = 12;
    }

    // Recent round trip and loss on one route; Rtt is -1 when every reply was lost, Samples is 0 before anything was measured
    struct RouteQuality
    {
        public int Rtt;
        public int Loss;
        public int Samples;
    }

    // Packets between a launcher and the relay; they start at 0xF0 so the relay never forwards them as tunnel packets
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

    // Round trip and loss percentage to the relay; Rtt is -1 when every echo was lost, Loss is -1 when nothing was measured
    struct RelayQuality
    {
        public static readonly RelayQuality Unknown = new RelayQuality { Rtt = -1, Loss = -1 };
        public int Rtt;
        public int Loss;
    }

    // Carries Dota's UDP traffic between two launchers over a single port, so both Dota processes only talk to localhost
    abstract class Tunnel : IDisposable
    {
        public const int GamePort = 27015;
        // Longer than the host's polling interval so the host joins in before the joiner gives up
        protected const int HandshakeMs = 15000;
        protected const int KeepaliveMs = 10000;
        // Dota itself drops a silent connection after about 30 seconds
        protected const int SilenceMs = 30000;
        const int HelloIntervalMs = 200;
        const int MaxLanCandidates = 6;
        const int SioUdpConnReset = -1744830452;
        const int RelayRetryMs = 500;
        // Twenty echoes resolve loss to five percent while the whole probe stays under three seconds
        const int RelayProbeCount = 20;
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
            // An unreachable candidate answers with ICMP, which Windows would otherwise raise on the next receive
            Socket.Client.IOControl(SioUdpConnReset, new byte[] { 0 }, null);
        }

        int Port { get { return ((IPEndPoint)Socket.Client.LocalEndPoint).Port; } }

        public bool? SymmetricNat;

        // Must run before Start, because STUN reads its answer from the same socket
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
                        // Closing the socket ends the loop; anything else is a bad packet
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
        // Sends Hello to every candidate until done() says the handshake settled or the window ends.
        // The relay candidate joins the list once its claim succeeds, so the list is locked while it is read
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

        // Each relay gets this much of the handshake window before the next one in the list is tried
        const int RelaySliceMs = 4000;

        // Registers this socket on one of the relays in the ticket for one join and returns the relay port that reaches
        // the other side, or null when none of them answers within the handshake window or claims the ticket.
        // Both sides walk the same order, and a full relay still accepts the side whose partner already waits there, so they end on the same relay
        protected IPEndPoint ClaimRelay(RelayTicket relay, out IPEndPoint used)
        {
            used = null;
            // An Allocated reply does not name its join, so a host claims for one joiner at a time
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
                        // A late reply to an earlier allocation names another join's port; allocate again on this same relay
                    }
                }
                return null;
            }
        }

        // The lowest of a few round trips to the relay, or -1 when it never answers
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

        // Repeats the request until the relay answers from that address, since either packet may be lost
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
            // Only joiners that answer pings are reported, so a launcher too old to echo does not show as total loss
            public bool Echoed;
            public int Sent;
            public readonly List<int> Rtts = new List<int>();
        }

        // A probe only measures the route, and its token is forgotten shortly after so it cannot be used to play
        const int ProbeLingerMs = 5000;
        // Every third roster round: sparse enough to cost nothing next to the game's own traffic, yet fifty pings a report still resolve loss to two percent
        const int QualityPingMs = 6000;

        readonly object sync = new object();
        readonly Dictionary<string, string> joinIds = new Dictionary<string, string>();
        readonly HashSet<string> probes = new HashSet<string>();
        readonly Dictionary<string, string> paths = new Dictionary<string, string>();
        readonly Dictionary<IPEndPoint, string> verified = new Dictionary<IPEndPoint, string>();
        readonly Dictionary<string, Peer> peers = new Dictionary<string, Peer>();
        // The relay address a join actually claimed, when its route turned out to be the relay
        readonly Dictionary<string, string> relayUsed = new Dictionary<string, string>();
        // Route checks waiting for the next poll, and the last one per joiner so the repeated copies are counted once
        readonly List<Dictionary<string, object>> routeChecks = new List<Dictionary<string, object>>();
        readonly Dictionary<string, string> lastRouteCheck = new Dictionary<string, string>();

        // joinId, the reported path or null when the handshake failed, the relay address used when the path is relay, and milliseconds taken
        public event Action<string, string, string, int> JoinFinished;
        public event Action<string> JoinLeft;
        public Func<List<RosterEntry>> RosterSource;
        public volatile bool GameEnded;

        public HostTunnel()
        {
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
                            // Roster packets go out every two seconds, so they also keep the route open
                            for (var i = 0; i < roster.Count; i++) SendTo(peer, Packet.Roster, roster[i].Encode(i, roster.Count));
                            if (GameEnded) SendTo(peer, Packet.GameEnded, new byte[0]);
                            if (peer.Remote != null && (DateTime.UtcNow - peer.LastSent).TotalMilliseconds > KeepaliveMs) SendTo(peer, Packet.Keepalive, new byte[0]);
                            // A joiner that left or dropped stops being measured once Dota itself would give up on it
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
                // A kicked joiner's token is gone, which also ends its handshake
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

        // Ping results per joiner since the last call, each with the route in use when it was taken
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

        // Route checks joiners reported since the last call
        public List<Dictionary<string, object>> TakeRouteChecks()
        {
            lock (sync)
            {
                var list = new List<Dictionary<string, object>>(routeChecks);
                routeChecks.Clear();
                return list;
            }
        }

        // Tells the joiner it was removed and drops its session; its later packets come from an unknown token
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
                    // Sent a few times because a lost packet would leave the joiner reconnecting until it gives up
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
                // A probe never reaches the dedicated server
                if (probes.Contains(owner)) return;
                var peer = PeerOf(owner);
                // The joiner may switch routes after a reconnect, so replies follow its latest packet
                peer.Remote = from;
                peer.LastReceived = DateTime.UtcNow;
                // A reconnect selects again, and the latest route is the one the quality report names
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
                }
            }
        }

        // Each joiner gets its own local socket, so the dedicated server sees separate clients
        Peer PeerOf(string token)
        {
            Peer peer;
            if (peers.TryGetValue(token, out peer)) return peer;
            peer = new Peer { Local = new UdpClient(new IPEndPoint(IPAddress.Loopback, 0)) };
            NativeMethods.KeepPrivate(peer.Local.Client);
            peer.Local.Connect(IPAddress.Loopback, GamePort);
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
        // Wait this long after the first route answers, in case the faster LAN route is about to answer too
        const int SettleMs = 300;
        // Peers that can punch through usually connect within a second, so waiting this long keeps them off the relay
        const int RelayWaitMs = 3000;
        // Gives up after this long without the host, which by then has most likely closed the game
        const int GiveUpMs = 90000;
        const int QuietMs = 7000;
        // The lowest of a few round trips, so one packet delayed by the first hole punch does not set the latency
        const int PingSamples = 3;
        // Twenty pings a second on each route for ten seconds tell 0% from 5% loss, and the game barely notices the extra packets
        const int CheckMs = 10000;
        const int CheckGapMs = 50;
        // Replies still on the way when a measurement stops are waited for, so they do not count as lost
        const int LateReplyMs = 1000;
        // The handshake usually settles on the direct route before the relay claim finishes
        const int RelayReachMs = 8000;
        // The status line describes the last minute of the route, not the whole game
        const int StatusWindowMs = 60000;
        const string DirectMeter = "~direct";
        const string RelayMeter = "~relay";
        const string StatusMeter = "~status";

        class Probe
        {
            public int Samples;
            public int Rtt = -1;
        }

        // Ping stamps sent on one route and the round trip of each that came back
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

        public volatile bool Lost;
        public volatile bool Kicked;
        public volatile bool GameEnded;
        readonly Dictionary<int, RosterEntry> roster = new Dictionary<int, RosterEntry>();
        int rosterCount = -1;
        // Shown until the host's own list arrives
        public List<RosterEntry> Placeholder = new List<RosterEntry>();
        // Lets a tester whose network can punch through still play a whole game over the relay
        public static bool RelayOnly;
        // Loss limits from the API for moving from the direct route to the relay; null leaves the handshake's route alone
        public RouteThresholds Thresholds;

        public bool Checking
        {
            get { lock (sync) return checking; }
        }

        // Returns the path type that connected, or null when nothing answered in the handshake window
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

        // Measures the round trip to a room without joining it, or returns -1 when the host never answers.
        // Probes share this socket with the later join, so the route a probe opened is the one the join uses
        public int Measure(string probeToken, List<Candidate> hostCandidates)
        {
            var probe = new Probe();
            lock (sync) probes[probeToken] = probe;
            Burst(probeToken, hostCandidates, () => { lock (sync) return probe.Samples >= PingSamples; });
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

        void OnPong(byte[] data)
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
            probe.Samples++;
            if (probe.Rtt < 0 || ms < probe.Rtt) probe.Rtt = ms;
        }

        string Handshake()
        {
            lock (sync)
            {
                reached.Clear();
                host = null;
            }
            // Claimed again on every handshake, so a reconnect from a changed address reaches the relay too
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
                        // Select may be lost like any UDP packet, and the host only needs one
                        for (var i = 0; i < 3; i++) Send(Packet.Select, index, host);
                        lastSent = DateTime.UtcNow;
                        return type;
                    }
                }
            }
            return null;
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

        // The host sends its roster every two seconds, so missing a few rounds already means trouble
        public bool Silent
        {
            get { lock (sync) return host != null && (DateTime.UtcNow - lastReceived).TotalMilliseconds > QuietMs; }
        }

        // Opens the local port Dota connects to and starts watching the link
        public void Forward()
        {
            local = new UdpClient(new IPEndPoint(IPAddress.Loopback, GamePort));
            NativeMethods.KeepPrivate(local.Client);
            new Thread(() =>
            {
                while (!Closed)
                {
                    try
                    {
                        var from = new IPEndPoint(IPAddress.Any, 0);
                        var payload = local.Receive(ref from);
                        lock (sync)
                        {
                            dota = from;
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
                // The host still accepts our token, so the route can be rebuilt without the API
                if (Handshake() != null) StartRouteCheck();
            }
        }

        public void StartRouteCheck()
        {
            new Thread(CheckRoute) { IsBackground = true }.Start();
        }

        // Measures the direct route against the relay right after connecting and moves to the relay when only the direct one loses packets.
        // The choice holds for the rest of the game; the host follows whichever route our packets arrive on
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
                    // A reconnect during the check already picked a route of its own
                    if (Closed || !direct.Equals(host)) return;
                    if (directQuality.Loss >= limits.DirectLossPct && relayQuality.Loss <= limits.RelayLossPct)
                    {
                        host = relayEnd;
                        route = PathType.Relay;
                        meters.Remove(StatusMeter);
                        var index = new[] { (byte)Array.IndexOf(PathType.Preference, PathType.Relay) };
                        for (var i = 0; i < 3; i++) Send(Packet.Select, index, host);
                        lastSent = DateTime.UtcNow;
                    }
                    var report = new byte[7];
                    report[0] = (byte)Array.IndexOf(PathType.Preference, route);
                    report[1] = (byte)directQuality.Loss;
                    report[2] = (byte)relayQuality.Loss;
                    Buffer.BlockCopy(BitConverter.GetBytes(Rtt16(directQuality)), 0, report, 3, 2);
                    Buffer.BlockCopy(BitConverter.GetBytes(Rtt16(relayQuality)), 0, report, 5, 2);
                    // Sent a few times like Select; the host counts identical copies once
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

        // Says hello over the relay until the host answers there, since the handshake stops as soon as the direct route answers
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

        // Loss and median round trip of the pings sent within the window, or of all of them when the window is 0.
        // The last second is left out of a window because its replies may still be on the way
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

        // The route in use and its last minute, for the joiner's status line
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
                    // The host also punches toward us; answering would connect directly and skip the relay under test
                    if (joining && RelayOnly && TypeOf(from) != PathType.Relay) return;
                    if (data[0] == Packet.Hello) Send(Packet.Ack, Encoding.ASCII.GetBytes(received), from);
                    if (joining)
                    {
                        if (!reached.ContainsKey(from)) reached[from] = TypeOf(from);
                    }
                    // Every answer is followed by a ping, so the samples arrive within a few handshake rounds
                    else SendPing(received, from);
                    return;
                }
                if (data[0] == Packet.Pong)
                {
                    OnPong(data);
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
                    GameEnded = true;
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
                        // A malformed entry is skipped; the next round replaces it
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

        // An answer from an address we never listed came through a NAT mapping that STUN did not predict
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
