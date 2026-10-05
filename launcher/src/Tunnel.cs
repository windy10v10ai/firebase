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

        protected readonly UdpClient Socket;
        protected volatile bool Closed;
        readonly object relayClaim = new object();
        readonly object relaySync = new object();
        IPEndPoint relayWaitFrom;
        byte[] relayAnswer;

        protected Tunnel()
        {
            Socket = new UdpClient(new IPEndPoint(IPAddress.Any, 0));
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

        // Registers this socket on the relay for one join and returns the relay port that reaches the other side,
        // or null when the relay does not answer within the handshake window or refuses the ticket
        protected IPEndPoint ClaimRelay(RelayTicket relay)
        {
            // An Allocated reply does not name its join, so a host claims for one joiner at a time
            lock (relayClaim)
            {
                var ticket = Encoding.ASCII.GetBytes(relay.Ticket);
                var deadline = DateTime.UtcNow.AddMilliseconds(HandshakeMs);
                while (!Closed && DateTime.UtcNow < deadline)
                {
                    var allocated = AskRelay(RelayPacket.Allocate, ticket, relay.Control, deadline);
                    if (allocated == null || allocated[0] != RelayPacket.Allocated || allocated.Length < 3) return null;
                    var session = new IPEndPoint(relay.Control.Address, (allocated[1] << 8) | allocated[2]);
                    var claimed = AskRelay(RelayPacket.Claim, ticket, session, deadline);
                    if (claimed == null) return null;
                    if (claimed[0] == RelayPacket.Claimed) return session;
                    // A late reply to an earlier allocation names another join's port, which refuses this ticket
                }
                return null;
            }
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
            public volatile bool Closed;
        }

        // A probe only measures the route, and its token is forgotten shortly after so it cannot be used to play
        const int ProbeLingerMs = 5000;

        readonly object sync = new object();
        readonly Dictionary<string, string> joinIds = new Dictionary<string, string>();
        readonly HashSet<string> probes = new HashSet<string>();
        readonly Dictionary<string, string> paths = new Dictionary<string, string>();
        readonly Dictionary<IPEndPoint, string> verified = new Dictionary<IPEndPoint, string>();
        readonly Dictionary<string, Peer> peers = new Dictionary<string, Peer>();

        // joinId, the reported path or null when the handshake failed, and milliseconds taken
        public event Action<string, string, int> JoinFinished;
        public event Action<string> JoinLeft;
        public Func<List<RosterEntry>> RosterSource;
        public volatile bool GameEnded;

        public HostTunnel()
        {
            new Thread(() =>
            {
                while (!Closed)
                {
                    Thread.Sleep(2000);
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
                        var session = ClaimRelay(relay);
                        if (session == null) return;
                        lock (candidates) candidates.Add(new Candidate(PathType.Relay, session));
                    }) { IsBackground = true }.Start();
                }
                // A kicked joiner's token is gone, which also ends its handshake
                Burst(token, candidates, () => { lock (sync) return paths.ContainsKey(token) || !joinIds.ContainsKey(token); });
                string path;
                bool kicked;
                lock (sync)
                {
                    paths.TryGetValue(token, out path);
                    kicked = !joinIds.ContainsKey(token);
                }
                var handler = JoinFinished;
                if (handler != null && !Closed && !kicked) handler(joinId, path == null ? null : PathType.Report(path), (int)(DateTime.UtcNow - started).TotalMilliseconds);
            }) { IsBackground = true }.Start();
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
                if (data[0] == Packet.Select && data.Length == 2 && data[1] < PathType.Preference.Length && !paths.ContainsKey(owner))
                {
                    paths[owner] = PathType.Preference[data[1]];
                }
                else if (data[0] == Packet.Bye)
                {
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

        class Probe
        {
            public int Samples;
            public int Rtt = -1;
        }

        readonly object sync = new object();
        readonly Dictionary<IPEndPoint, string> reached = new Dictionary<IPEndPoint, string>();
        readonly Dictionary<string, Probe> probes = new Dictionary<string, Probe>();
        string token;
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

        void SendPing(string probeToken, IPEndPoint to)
        {
            var stamp = BitConverter.GetBytes(Stopwatch.GetTimestamp());
            var id = Encoding.ASCII.GetBytes(probeToken);
            var payload = new byte[stamp.Length + id.Length];
            Buffer.BlockCopy(stamp, 0, payload, 0, stamp.Length);
            Buffer.BlockCopy(id, 0, payload, stamp.Length, id.Length);
            Send(Packet.Ping, payload, to);
        }

        void OnPong(byte[] data)
        {
            if (data.Length < 9) return;
            Probe probe;
            if (!probes.TryGetValue(Encoding.ASCII.GetString(data, 9, data.Length - 9), out probe)) return;
            var sent = BitConverter.ToInt64(data, 1);
            var ms = (int)((Stopwatch.GetTimestamp() - sent) * 1000 / Stopwatch.Frequency);
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
                    var session = ClaimRelay(ticket);
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
                Handshake();
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
