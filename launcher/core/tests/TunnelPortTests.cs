using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Threading;

namespace Windy10v10AI.Launcher.Tests
{
    static class TunnelPortTests
    {
        public static void RunAll()
        {
            using (var server = new UdpClient(new IPEndPoint(IPAddress.Loopback, 0)))
            using (var client = new UdpClient(new IPEndPoint(IPAddress.Loopback, 0)))
            using (var host = new HostTunnel(((IPEndPoint)server.Client.LocalEndPoint).Port))
            using (var join = new JoinTunnel())
            {
                Platform.KeepPrivate(server.Client);
                Platform.KeepPrivate(client.Client);
                server.Client.ReceiveTimeout = 3000;
                client.Client.ReceiveTimeout = 3000;
                host.GameReady = false;
                host.RosterSource = () => new List<RosterEntry> { new RosterEntry { Name = "host", IsHost = true } };
                host.Start();
                join.Start();
                var token = Guid.NewGuid().ToString("N");
                host.AddJoin("isolated", token, new List<Candidate> { new Candidate(PathType.Lan, Address(join)) }, false, null);
                if (join.Connect(token, new List<Candidate> { new Candidate(PathType.Lan, Address(host)) }, null) != PathType.Lan)
                    throw new Exception("isolated tunnel handshake failed");
                Wait(() => join.HasRoster && !join.GameReady, "first game must wait for the host");
                host.GameReady = true;
                Wait(() => join.GameReady, "first game readiness must reach the joiner");
                join.Forward(0);
                var local = (UdpClient)typeof(JoinTunnel).GetField("local", BindingFlags.NonPublic | BindingFlags.Instance).GetValue(join);
                var payload = new byte[] { 31, 65, 0, 255, 78 };
                client.Send(payload, payload.Length, (IPEndPoint)local.Client.LocalEndPoint);
                var from = new IPEndPoint(IPAddress.Any, 0);
                Equal(payload, server.Receive(ref from));
                var reply = new byte[] { 75, 0, 128, 91 };
                server.Send(reply, reply.Length, from);
                Equal(reply, client.Receive(ref from));
            }
            Console.WriteLine("PASS isolated tunnel ports and bidirectional UDP");
        }

        static void Wait(Func<bool> ready, string failure)
        {
            var deadline = DateTime.UtcNow.AddSeconds(5);
            while (DateTime.UtcNow < deadline)
            {
                if (ready()) return;
                Thread.Sleep(20);
            }
            throw new Exception(failure);
        }

        static IPEndPoint Address(Tunnel tunnel)
        {
            var socket = (UdpClient)typeof(Tunnel).GetField("Socket", BindingFlags.NonPublic | BindingFlags.Instance).GetValue(tunnel);
            return new IPEndPoint(IPAddress.Loopback, ((IPEndPoint)socket.Client.LocalEndPoint).Port);
        }

        static void Equal(byte[] expected, byte[] actual)
        {
            if (expected.Length != actual.Length) throw new Exception("tunnel payload length changed");
            for (var i = 0; i < expected.Length; i++)
                if (expected[i] != actual[i]) throw new Exception("tunnel payload changed");
        }
    }
}
