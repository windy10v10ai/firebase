using System;
using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text;

namespace Windy10v10AI.Launcher.Tests
{
    static class LocalGateTests
    {
        public static void RunAll()
        {
            AnswersInfoAsDota();
            AsksForChallengeBeforePlayers();
            ListsNoPlayersWithChallenge();
            LeavesGameTrafficAlone();
            GateDelaysInfoAndForwardsGameTraffic();
            Console.WriteLine("PASS Local gate tests");
        }

        static byte[] Query(byte kind, byte[] tail)
        {
            var head = new byte[] { 0xFF, 0xFF, 0xFF, 0xFF, kind };
            var packet = new byte[head.Length + tail.Length];
            Array.Copy(head, packet, head.Length);
            Array.Copy(tail, 0, packet, head.Length, tail.Length);
            return packet;
        }

        static byte[] InfoQuery()
        {
            return Query(0x54, Encoding.ASCII.GetBytes("Source Engine Query\0"));
        }

        static void AnswersInfoAsDota()
        {
            bool delayed;
            var reply = SteamQuery.Answer(InfoQuery(), out delayed);
            True(delayed, "waits before answering the info query");
            Equal(0x49, reply[4], "answers with an info reply");
            var marker = Encoding.ASCII.GetBytes("Dota 2\0");
            var at = IndexOf(reply, marker);
            True(at > 0, "names the game");
            Equal(570, BitConverter.ToUInt16(reply, at + marker.Length), "carries Dota's app id");
        }

        static int IndexOf(byte[] data, byte[] part)
        {
            for (var i = 0; i + part.Length <= data.Length; i++)
            {
                var match = true;
                for (var j = 0; j < part.Length && match; j++) match = data[i + j] == part[j];
                if (match) return i;
            }
            return -1;
        }

        static void AsksForChallengeBeforePlayers()
        {
            bool delayed;
            var reply = SteamQuery.Answer(Query(0x55, new byte[] { 0xFF, 0xFF, 0xFF, 0xFF }), out delayed);
            True(!delayed, "answers a player query at once");
            Equal(0x41, reply[4], "asks for the challenge first");
            Equal(9, reply.Length, "sends a four-byte challenge");
        }

        static void ListsNoPlayersWithChallenge()
        {
            bool delayed;
            var challenge = SteamQuery.Answer(Query(0x55, new byte[] { 0xFF, 0xFF, 0xFF, 0xFF }), out delayed);
            var reply = SteamQuery.Answer(Query(0x55, new[] { challenge[5], challenge[6], challenge[7], challenge[8] }), out delayed);
            Equal(0x44, reply[4], "answers the player list once the challenge comes back");
            Equal(0, reply[5], "lists no players");
        }

        static void LeavesGameTrafficAlone()
        {
            True(!SteamQuery.IsQuery(new byte[] { 0x20, 0x10, 0, 0x0d, 1, 2, 3 }), "does not treat game traffic as a query");
            True(SteamQuery.IsQuery(InfoQuery()), "recognises Steam's info query");
        }

        static void GateDelaysInfoAndForwardsGameTraffic()
        {
            using (var server = new UdpClient(new IPEndPoint(IPAddress.Loopback, 0)))
            using (var dota = new UdpClient(new IPEndPoint(IPAddress.Loopback, 0)))
            {
                server.Client.ReceiveTimeout = 2000;
                dota.Client.ReceiveTimeout = 2000;
                var probe = new UdpClient(new IPEndPoint(IPAddress.Loopback, 0));
                var listenPort = ((IPEndPoint)probe.Client.LocalEndPoint).Port;
                probe.Close();
                var gate = new LocalGate(((IPEndPoint)server.Client.LocalEndPoint).Port, listenPort);
                try
                {
                    var gateEnd = new IPEndPoint(IPAddress.Loopback, listenPort);
                    var query = InfoQuery();
                    var clock = Stopwatch.StartNew();
                    dota.Send(query, query.Length, gateEnd);
                    var from = new IPEndPoint(IPAddress.Any, 0);
                    var info = dota.Receive(ref from);
                    True(clock.ElapsedMilliseconds >= SteamQuery.InfoDelayMs - 5, "holds the info reply back");
                    Equal(0x49, info[4], "the gate answers the query itself");
                    True(gate.LastPacket == null, "a query does not count as Dota in the game");

                    var game = new byte[] { 0x20, 0x10, 0, 0x0d, 42 };
                    dota.Send(game, game.Length, gateEnd);
                    var seen = server.Receive(ref from);
                    Equal(42, seen[4], "passes game traffic to the server");
                    True(gate.LastPacket != null, "game traffic marks Dota as in the game");

                    var back = new byte[] { 7, 7, 7 };
                    server.Send(back, back.Length, from);
                    var reply = dota.Receive(ref from);
                    Equal(3, reply.Length, "passes the server's reply back to Dota");
                }
                finally
                {
                    gate.Dispose();
                }
            }
        }

        static void True(bool condition, string name)
        {
            if (!condition) throw new Exception(name);
        }

        static void Equal(int expected, int actual, string name)
        {
            if (expected != actual) throw new Exception(name + ": expected " + expected + ", got " + actual);
        }
    }
}
