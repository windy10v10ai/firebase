using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;

namespace Windy10v10AI.Launcher
{
    // Steam asks a server what it is before handing steam://connect to a running Dota, and a dedicated server
    // only answers once the player's gameinfo.gi is changed, so the launcher answers on the server's behalf
    static class SteamQuery
    {
        const byte InfoRequest = 0x54;
        const byte PlayerRequest = 0x55;
        const byte RulesRequest = 0x56;
        const int DotaAppId = 570;
        // An answer within a millisecond can arrive before Steam has recorded its own query, and Steam then
        // reports an unknown game instead of connecting
        public const int InfoDelayMs = 30;
        static readonly byte[] Challenge = { 0x57, 0x31, 0x30, 0x41 };

        public static bool IsQuery(byte[] data)
        {
            return data.Length >= 5 && data[0] == 0xFF && data[1] == 0xFF && data[2] == 0xFF && data[3] == 0xFF &&
                (data[4] == InfoRequest || data[4] == PlayerRequest || data[4] == RulesRequest);
        }

        // The reply to a query, and whether it should wait InfoDelayMs before going out
        public static byte[] Answer(byte[] data, out bool delayed)
        {
            delayed = data[4] == InfoRequest;
            if (data[4] == InfoRequest) return Info();
            var hasChallenge = data.Length >= 9 && data[5] == Challenge[0] && data[6] == Challenge[1] && data[7] == Challenge[2] && data[8] == Challenge[3];
            if (!hasChallenge) return Header(0x41, Challenge);
            return data[4] == PlayerRequest ? Header(0x44, new byte[] { 0 }) : Header(0x45, new byte[] { 0, 0 });
        }

        static byte[] Info()
        {
            var body = new List<byte> { 0x11 };
            foreach (var text in new[] { "Windy10v10AI", "dota", "dota", "Dota 2" }) AddText(body, text);
            body.AddRange(BitConverter.GetBytes((ushort)DotaAppId));
            body.AddRange(new byte[] { 0, 10, 0, (byte)'d', (byte)'w', 0, 1 });
            AddText(body, "1.0");
            return Header(0x49, body.ToArray());
        }

        static void AddText(List<byte> body, string text)
        {
            body.AddRange(Encoding.UTF8.GetBytes(text));
            body.Add(0);
        }

        static byte[] Header(byte kind, byte[] body)
        {
            var packet = new byte[5 + body.Length];
            packet[0] = packet[1] = packet[2] = packet[3] = 0xFF;
            packet[4] = kind;
            Array.Copy(body, 0, packet, 5, body.Length);
            return packet;
        }

        public static void Reply(UdpClient socket, byte[] query, IPEndPoint to)
        {
            bool delayed;
            var reply = Answer(query, out delayed);
            if (!delayed)
            {
                SendQuietly(socket, reply, to);
                return;
            }
            ThreadPool.QueueUserWorkItem(state =>
            {
                Thread.Sleep(InfoDelayMs);
                SendQuietly(socket, reply, to);
            });
        }

        static void SendQuietly(UdpClient socket, byte[] packet, IPEndPoint to)
        {
            try
            {
                socket.Send(packet, packet.Length, to);
            }
            catch (Exception)
            {
                // Steam queries again on its own
            }
        }
    }

    // The one local port every Dota connects to: answers Steam's query and passes the game's own traffic to the
    // dedicated server, so whether Dota is in the game can be read from the traffic alone
    class LocalGate : IDisposable
    {
        public const int Port = 27016;
        const int SioUdpConnReset = -1744830452;
        // A reconnect comes from a new port, so a client quiet this long is gone for good
        const int SessionIdleMs = 120000;

        readonly UdpClient socket;
        readonly IPEndPoint target;
        readonly object sync = new object();
        readonly Dictionary<string, Session> sessions = new Dictionary<string, Session>();
        long lastPacketTicks;
        volatile bool closed;

        class Session
        {
            public UdpClient Upstream;
            public DateTime LastUsed;
        }

        public LocalGate(int targetPort) : this(targetPort, Port)
        {
        }

        internal LocalGate(int targetPort, int listenPort)
        {
            target = new IPEndPoint(IPAddress.Loopback, targetPort);
            socket = new UdpClient(new IPEndPoint(IPAddress.Loopback, listenPort));
            NativeMethods.KeepPrivate(socket.Client);
            // A closed Dota's port would otherwise fail every following receive
            socket.Client.IOControl(SioUdpConnReset, new byte[] { 0 }, null);
            new Thread(Receive) { IsBackground = true }.Start();
        }

        // When Dota last sent anything to the server, or null before it ever did
        public DateTime? LastPacket
        {
            get
            {
                var ticks = Interlocked.Read(ref lastPacketTicks);
                return ticks == 0 ? (DateTime?)null : new DateTime(ticks, DateTimeKind.Utc);
            }
        }

        void Receive()
        {
            while (!closed)
            {
                try
                {
                    var from = new IPEndPoint(IPAddress.Any, 0);
                    var data = socket.Receive(ref from);
                    if (SteamQuery.IsQuery(data))
                    {
                        SteamQuery.Reply(socket, data, from);
                        continue;
                    }
                    Interlocked.Exchange(ref lastPacketTicks, DateTime.UtcNow.Ticks);
                    var session = SessionFor(from);
                    session.Upstream.Send(data, data.Length);
                }
                catch (Exception)
                {
                    if (closed) return;
                }
            }
        }

        Session SessionFor(IPEndPoint from)
        {
            var key = from.ToString();
            lock (sync)
            {
                if (closed) throw new ObjectDisposedException("LocalGate");
                Session session;
                if (sessions.TryGetValue(key, out session))
                {
                    session.LastUsed = DateTime.UtcNow;
                    return session;
                }
                foreach (var stale in new List<string>(sessions.Keys))
                {
                    if ((DateTime.UtcNow - sessions[stale].LastUsed).TotalMilliseconds < SessionIdleMs) continue;
                    sessions[stale].Upstream.Close();
                    sessions.Remove(stale);
                }
                var upstream = new UdpClient(new IPEndPoint(IPAddress.Loopback, 0));
                NativeMethods.KeepPrivate(upstream.Client);
                upstream.Connect(target);
                session = new Session { Upstream = upstream, LastUsed = DateTime.UtcNow };
                sessions[key] = session;
                var client = from;
                new Thread(() => Pump(upstream, client)) { IsBackground = true }.Start();
                return session;
            }
        }

        void Pump(UdpClient upstream, IPEndPoint client)
        {
            while (!closed)
            {
                try
                {
                    var any = new IPEndPoint(IPAddress.Any, 0);
                    var data = upstream.Receive(ref any);
                    socket.Send(data, data.Length, client);
                }
                catch (ObjectDisposedException)
                {
                    return;
                }
                catch (Exception)
                {
                    // A restarting server refuses for a moment; the session carries on once it is back
                    if (closed) return;
                }
            }
        }

        public void Dispose()
        {
            closed = true;
            socket.Close();
            lock (sync)
            {
                foreach (var session in sessions.Values) session.Upstream.Close();
                sessions.Clear();
            }
        }
    }
}
