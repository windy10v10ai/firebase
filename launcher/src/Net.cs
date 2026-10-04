using System;
using System.Collections.Generic;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Reflection;
using System.Threading;
using Microsoft.Win32;

namespace Windy10v10AI.Launcher
{
    // Ways a peer may be reached; the order is the preference when several work
    static class PathType
    {
        public const string Lan = "lan";
        public const string Upnp = "upnp";
        public const string Stun = "stun";

        public static readonly string[] Preference = { Lan, Upnp, Stun };

        // Statistics name a STUN route by how it was reached
        public static string Report(string type)
        {
            return type == Stun ? "punch" : type;
        }
    }

    class Candidate
    {
        public readonly string Type;
        public readonly IPEndPoint EndPoint;

        public Candidate(string type, IPEndPoint endPoint)
        {
            Type = type;
            EndPoint = endPoint;
        }

        public override string ToString()
        {
            return Type + ":" + EndPoint;
        }

        public static Candidate Parse(string text)
        {
            var parts = text.Split(':');
            return new Candidate(parts[0], new IPEndPoint(IPAddress.Parse(parts[1]), int.Parse(parts[2])));
        }
    }

    static class Net
    {
        static readonly string[] StunServers =
        {
            "stun.miwifi.com:3478",
            "stun.chat.bilibili.com:3478",
            "stun.cloudflare.com:3478",
            "stun.l.google.com:19302",
        };
        const int StunTimeout = 1500;
        const int UpnpTimeout = 8000;

        // Adapters without a gateway are virtual ones (WSL, Hyper-V) that another PC cannot reach
        public static List<IPAddress> LanAddresses()
        {
            var result = new List<IPAddress>();
            foreach (var adapter in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (adapter.OperationalStatus != OperationalStatus.Up) continue;
                var props = adapter.GetIPProperties();
                var hasGateway = false;
                foreach (var gateway in props.GatewayAddresses)
                {
                    if (gateway.Address.AddressFamily == AddressFamily.InterNetwork && !gateway.Address.Equals(IPAddress.Any)) hasGateway = true;
                }
                if (!hasGateway) continue;
                foreach (var address in props.UnicastAddresses)
                {
                    if (address.Address.AddressFamily == AddressFamily.InterNetwork) result.Add(address.Address);
                }
            }
            return result;
        }

        // Asks public STUN servers which address our socket appears as; must run before the tunnel starts receiving.
        // A router that shows two servers different ports is a symmetric NAT, which hole punching cannot get through
        public static IPEndPoint Stun(UdpClient socket, out bool? symmetric)
        {
            symmetric = null;
            var oldTimeout = socket.Client.ReceiveTimeout;
            socket.Client.ReceiveTimeout = StunTimeout;
            try
            {
                IPEndPoint first = null;
                foreach (var server in StunServers)
                {
                    var mapped = AskStun(socket, server);
                    if (mapped == null) continue;
                    if (first == null)
                    {
                        first = mapped;
                        continue;
                    }
                    symmetric = !mapped.Equals(first);
                    break;
                }
                return first;
            }
            finally
            {
                socket.Client.ReceiveTimeout = oldTimeout;
            }
        }

        static IPEndPoint AskStun(UdpClient socket, string server)
        {
            try
            {
                var parts = server.Split(':');
                var addresses = Dns.GetHostAddresses(parts[0]);
                var target = Array.Find(addresses, a => a.AddressFamily == AddressFamily.InterNetwork);
                if (target == null) return null;
                var request = new byte[20];
                request[1] = 0x01;
                request[4] = 0x21; request[5] = 0x12; request[6] = 0xA4; request[7] = 0x42;
                var id = Guid.NewGuid().ToByteArray();
                Array.Copy(id, 0, request, 8, 12);
                socket.Send(request, request.Length, new IPEndPoint(target, int.Parse(parts[1])));
                var deadline = DateTime.UtcNow.AddMilliseconds(StunTimeout);
                while (DateTime.UtcNow < deadline)
                {
                    var from = new IPEndPoint(IPAddress.Any, 0);
                    var response = socket.Receive(ref from);
                    var mapped = ParseStun(response, request);
                    if (mapped != null) return mapped;
                }
            }
            catch (Exception)
            {
                // Some servers are blocked in some regions
            }
            return null;
        }

        static IPEndPoint ParseStun(byte[] data, byte[] request)
        {
            if (data.Length < 20 || data[0] != 0x01 || data[1] != 0x01) return null;
            for (var i = 4; i < 20; i++) if (data[i] != request[i]) return null;
            var offset = 20;
            while (offset + 4 <= data.Length)
            {
                var type = (data[offset] << 8) | data[offset + 1];
                var length = (data[offset + 2] << 8) | data[offset + 3];
                var value = offset + 4;
                if (value + length > data.Length) break;
                // XOR-MAPPED-ADDRESS, or MAPPED-ADDRESS from older servers; IPv4 only
                if ((type == 0x0020 || type == 0x0001) && length >= 8 && data[value + 1] == 0x01)
                {
                    var xor = type == 0x0020;
                    var port = (data[value + 2] << 8) | data[value + 3];
                    if (xor) port ^= 0x2112;
                    var ip = new byte[4];
                    for (var i = 0; i < 4; i++) ip[i] = (byte)(data[value + 4 + i] ^ (xor ? request[4 + i] : 0));
                    return new IPEndPoint(new IPAddress(ip), port);
                }
                offset = value + ((length + 3) & ~3);
            }
            return null;
        }

        // Asks the router to forward the same UDP port to us through Windows' built-in UPnP client; null when it cannot
        public static IPAddress MapUpnp(int port, IPAddress lan)
        {
            IPAddress result = null;
            var worker = new Thread(() =>
            {
                try
                {
                    var mappings = UpnpMappings();
                    if (mappings == null) return;
                    var mapping = mappings.GetType().InvokeMember("Add", BindingFlags.InvokeMethod, null, mappings,
                        new object[] { port, "UDP", port, lan.ToString(), true, "Windy10v10AI" });
                    var external = (string)mapping.GetType().InvokeMember("ExternalIPAddress", BindingFlags.GetProperty, null, mapping, null);
                    IPAddress parsed;
                    if (IPAddress.TryParse(external, out parsed)) result = parsed;
                }
                catch (Exception)
                {
                    // Router without UPnP, or the user turned it off
                }
            }) { IsBackground = true };
            worker.Start();
            // The COM call blocks for a long time on routers that ignore discovery
            worker.Join(UpnpTimeout);
            return result;
        }

        public static void UnmapUpnp(int port)
        {
            try
            {
                var mappings = UpnpMappings();
                if (mappings != null) mappings.GetType().InvokeMember("Remove", BindingFlags.InvokeMethod, null, mappings, new object[] { port, "UDP" });
            }
            catch (Exception)
            {
            }
        }

        static object UpnpMappings()
        {
            var type = Type.GetTypeFromProgID("HNetCfg.NATUPnP");
            if (type == null) return null;
            var nat = Activator.CreateInstance(type);
            return type.InvokeMember("StaticPortMappingCollection", BindingFlags.GetProperty, null, nat, null);
        }

        // The account Steam is signed in with, as the 32-bit ID the game API uses; 0 when Steam is not running
        public static long SteamAccountId()
        {
            var value = Registry.GetValue(@"HKEY_CURRENT_USER\Software\Valve\Steam\ActiveProcess", "ActiveUser", null);
            return value is int ? (uint)(int)value : 0;
        }
    }
}
