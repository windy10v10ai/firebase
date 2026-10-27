using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Threading;

namespace Windy10v10AI.Launcher.Tests
{
    static class RouteSwitchTests
    {
        public static void RunAll()
        {
            CountsLossPerSecond();
            SkipsSecondsWithoutGameTraffic();
            FollowsSequenceWraparound();
            ReportSurvivesTheWire();
            JudgesTheWorseDirection();
            ReadsInGameLimits();
            ComparesEitherWay();
            MovesALossyGameToTheRelay();
            Console.WriteLine("PASS Route switch tests");
        }

        static void CountsLossPerSecond()
        {
            var meter = new LossMeter();
            for (ushort seq = 1; seq <= 20; seq++)
            {
                if (seq % 4 != 0 || seq == 20) meter.Add(seq, 1000 + seq * 10);
            }
            meter.Add(21, 2100);
            var recent = meter.Recent(10, 2500);
            Equal(1, recent.Count, "finishes one second");
            Equal(20, recent[0], "a fifth of the second's packets missing is 20% loss");
            Equal(20, (int)meter.Expected, "counts the packets the second should have carried");
            Equal(16, (int)meter.Received, "counts the packets that arrived");
        }

        static void SkipsSecondsWithoutGameTraffic()
        {
            var meter = new LossMeter();
            for (ushort seq = 1; seq <= 3; seq++) meter.Add(seq, 1000 + seq);
            var recent = meter.Recent(10, 3500);
            Equal(2, recent.Count, "rolls over the quiet seconds too");
            Equal(LossMeter.NoData, recent[0], "a few packets between games are not judged");
            Equal(LossMeter.NoData, recent[1], "a second with nothing is not judged");
        }

        static void FollowsSequenceWraparound()
        {
            var meter = new LossMeter();
            ushort seq = 65530;
            for (var i = 0; i < 12; i++) meter.Add(seq++, 1000 + i);
            var recent = meter.Recent(1, 2000);
            Equal(0, recent[0], "numbers wrapping past 65535 are not loss");
        }

        static void ReportSurvivesTheWire()
        {
            var meter = new LossMeter();
            for (ushort seq = 1; seq <= 10; seq++) meter.Add(seq, 1000);
            for (ushort seq = 12; seq <= 20; seq++) meter.Add(seq, 2000);
            var packet = new byte[1 + 64];
            var report = meter.EncodeReport(60, 3000);
            Buffer.BlockCopy(report, 0, packet, 1, report.Length);
            long expected, received;
            List<int> recent;
            Yes(LossMeter.DecodeReport(packet, 1, out expected, out received, out recent), "decodes its own report");
            Equal(2, recent.Count, "carries each finished second");
            Equal(0, recent[0], "keeps the clean second");
            Equal(10, recent[1], "keeps the lossy second");
            Equal(20, (int)expected, "carries the expected total");
            Equal(19, (int)received, "carries the received total");
            No(LossMeter.DecodeReport(new byte[] { 15, 1, 2 }, 1, out expected, out received, out recent), "rejects a cut-off report");
        }

        static void JudgesTheWorseDirection()
        {
            var down = new List<int> { 0, 40, 38, LossMeter.NoData, 35 };
            var up = new List<int> { 0, 0, 0, 0, 0 };
            var link = LossMeter.Judge(down, up, 10);
            Equal(3, link.BadSeconds, "one-sided loss still counts its bad seconds");
            Equal(28, link.Loss, "averages the judged seconds of the worse direction");
            Equal(5, link.Seconds, "counts the seconds either direction could judge");
            Equal(10, LossMeter.Between(100, 90, 200, 180), "loss over the traffic between two readings");
            Equal(LossMeter.NoData, LossMeter.Between(100, 90, 105, 95), "too little traffic between readings to tell");
        }

        static void ReadsInGameLimits()
        {
            var answer = new Dictionary<string, object>
            {
                { "routeCheck", new Dictionary<string, object> { { "lossCostMs", 10 }, { "switchMarginMs", 30 }, { "badLossPct", 10 }, { "badSeconds", 6 }, { "windowSeconds", 10 } } },
            };
            var limits = RouteThresholds.Read(answer);
            Yes(limits.InGame, "switches during the game with every limit present");
            Equal(6, limits.BadSeconds, "reads the bad seconds");
            Equal(10, limits.WindowSeconds, "reads the window");
            var older = RouteThresholds.Read(new Dictionary<string, object> { { "routeCheck", new Dictionary<string, object> { { "lossCostMs", 10 }, { "switchMarginMs", 30 } } } });
            No(older.InGame, "an older API leaves the game to reconnects");
        }

        static void ComparesEitherWay()
        {
            var limits = new RouteThresholds { LossCostMs = 10, SwitchMarginMs = 30, BadLossPct = 10, BadSeconds = 6, WindowSeconds = 10 };
            Yes(limits.Prefers(Route(32, 38), Route(60, 1)), "leaves a lossy direct route for a clean relay");
            Yes(limits.Prefers(Route(60, 30), Route(35, 0)), "leaves a lossy relay for a clean direct route");
            No(limits.Prefers(Route(32, 12), Route(150, 0)), "keeps a mildly lossy route over a slow alternative");
            No(limits.Prefers(Route(32, 38), Route(-1, 100)), "never moves to a route that stopped answering");
        }

        // The direct route drops two in five game packets from the host while its pings get through; the game must end up on the relay
        static void MovesALossyGameToTheRelay()
        {
            using (var server = new UdpClient(new IPEndPoint(IPAddress.Loopback, 0)))
            using (var client = new UdpClient(new IPEndPoint(IPAddress.Loopback, 0)))
            using (var host = new HostTunnel(((IPEndPoint)server.Client.LocalEndPoint).Port))
            using (var join = new JoinTunnel())
            using (var direct = new Forwarder(Address(host), packet => packet[0] == Packet.SeqData))
            using (var relayRoute = new Forwarder(Address(host), packet => false))
            {
                Platform.KeepPrivate(server.Client);
                Platform.KeepPrivate(client.Client);
                server.Client.ReceiveTimeout = 3000;
                client.Client.ReceiveTimeout = 3000;
                host.RosterSource = () => new List<RosterEntry> { new RosterEntry { Name = "host", IsHost = true } };
                host.Start();
                join.Start();
                join.Thresholds = new RouteThresholds { LossCostMs = 10, SwitchMarginMs = 30, BadLossPct = 10, BadSeconds = 2, WindowSeconds = 3 };
                var token = Guid.NewGuid().ToString("N");
                host.AddJoin("switch", token, new List<Candidate>(), false, null);
                var path = join.Connect(token, new List<Candidate> { new Candidate(PathType.Stun, direct.Front), new Candidate(PathType.Relay, relayRoute.Front) }, null);
                if (path != PathType.Stun) throw new Exception("the handshake must settle on the direct route first, got " + path);
                join.Forward(0);
                var local = (UdpClient)typeof(JoinTunnel).GetField("local", BindingFlags.NonPublic | BindingFlags.Instance).GetValue(join);
                var hello = new byte[] { 1, 2, 3 };
                client.Send(hello, hello.Length, (IPEndPoint)local.Client.LocalEndPoint);
                var from = new IPEndPoint(IPAddress.Any, 0);
                server.Receive(ref from);
                var game = new byte[200];
                var deadline = DateTime.UtcNow.AddSeconds(20);
                string route = null;
                while (DateTime.UtcNow < deadline)
                {
                    server.Send(game, game.Length, from);
                    Thread.Sleep(20);
                    join.Status(out route);
                    if (route == PathType.Relay) break;
                }
                if (route != PathType.Relay) throw new Exception("a game losing two in five packets on the direct route must move to the relay");
                // Packets still on the way over the old route are drained before checking that the game flows over the relay
                Thread.Sleep(300);
                client.Client.ReceiveTimeout = 200;
                var player = new IPEndPoint(IPAddress.Any, 0);
                try
                {
                    while (true) client.Receive(ref player);
                }
                catch (SocketException)
                {
                }
                var before = relayRoute.Delivered;
                server.Send(game, game.Length, from);
                client.Client.ReceiveTimeout = 3000;
                client.Receive(ref player);
                Yes(relayRoute.Delivered > before, "game traffic reaches the player over the relay after the switch");
            }
        }

        // Stands between the joiner and the host like a relay or a NAT, dropping some of what the host sends back
        sealed class Forwarder : IDisposable
        {
            readonly UdpClient front = new UdpClient(new IPEndPoint(IPAddress.Loopback, 0));
            readonly UdpClient back = new UdpClient(new IPEndPoint(IPAddress.Loopback, 0));
            readonly IPEndPoint target;
            volatile IPEndPoint joiner;
            volatile bool closed;
            int count;
            public volatile int Delivered;

            public Forwarder(IPEndPoint target, Func<byte[], bool> lossy)
            {
                this.target = target;
                Platform.KeepPrivate(front.Client);
                Platform.KeepPrivate(back.Client);
                Platform.IgnoreUnreachable(front.Client);
                Platform.IgnoreUnreachable(back.Client);
                Pump(front, packet =>
                {
                    back.Send(packet, packet.Length, this.target);
                });
                Pump(back, packet =>
                {
                    if (joiner == null) return;
                    if (lossy(packet) && count++ % 5 < 2) return;
                    if (packet[0] == Packet.SeqData) Delivered++;
                    front.Send(packet, packet.Length, joiner);
                });
            }

            public IPEndPoint Front
            {
                get { return new IPEndPoint(IPAddress.Loopback, ((IPEndPoint)front.Client.LocalEndPoint).Port); }
            }

            void Pump(UdpClient socket, Action<byte[]> forward)
            {
                new Thread(() =>
                {
                    while (!closed)
                    {
                        try
                        {
                            var from = new IPEndPoint(IPAddress.Any, 0);
                            var packet = socket.Receive(ref from);
                            if (socket == front) joiner = from;
                            if (packet.Length > 0) forward(packet);
                        }
                        catch (Exception)
                        {
                            if (closed) return;
                        }
                    }
                })
                { IsBackground = true }.Start();
            }

            public void Dispose()
            {
                closed = true;
                front.Close();
                back.Close();
            }
        }

        static IPEndPoint Address(Tunnel tunnel)
        {
            var socket = (UdpClient)typeof(Tunnel).GetField("Socket", BindingFlags.NonPublic | BindingFlags.Instance).GetValue(tunnel);
            return new IPEndPoint(IPAddress.Loopback, ((IPEndPoint)socket.Client.LocalEndPoint).Port);
        }

        static RouteQuality Route(int rtt, int loss)
        {
            return new RouteQuality { Rtt = rtt, Loss = loss, Samples = 10 };
        }

        static void Yes(bool actual, string name)
        {
            if (!actual) throw new Exception(name + ": expected true");
        }

        static void No(bool actual, string name)
        {
            if (actual) throw new Exception(name + ": expected false");
        }

        static void Equal(int expected, int actual, string name)
        {
            if (expected != actual) throw new Exception(name + ": expected " + expected + ", got " + actual);
        }
    }
}
