using System;
using System.Collections.Generic;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using Microsoft.Win32;

namespace Windy10v10AI.Launcher
{
    // Ways a peer may be reached; the order is the preference when several work
    static class PathType
    {
        public const string Lan = "lan";
        public const string Upnp = "upnp";
        public const string Stun = "stun";
        public const string Relay = "relay";

        // Peers exchange a route as its index here, so the UPnP slot stays for older launchers even though none is gathered
        public static readonly string[] Preference = { Lan, Upnp, Stun, Relay };

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

    // The relays the API assigned to one join in the order both sides try them, and the ticket that proves this side belongs to it
    class RelayTicket
    {
        public readonly List<IPEndPoint> Addresses;
        public readonly string Ticket;

        RelayTicket(List<IPEndPoint> addresses, string ticket)
        {
            Addresses = addresses;
            Ticket = ticket;
        }

        // Null when the API sent no relay, so the join only tries LAN and hole punching
        public static RelayTicket Read(Dictionary<string, object> answer)
        {
            var relay = answer.ContainsKey("relay") ? answer["relay"] as Dictionary<string, object> : null;
            if (relay == null) return null;
            var ticket = relay.ContainsKey("ticket") ? relay["ticket"] as string : null;
            var addresses = ReadAddresses(relay, "addresses", "address");
            if (addresses.Count == 0 || string.IsNullOrEmpty(ticket)) return null;
            return new RelayTicket(addresses, ticket);
        }

        // The relay's IP:port as the API sends it, or null when absent or malformed
        public static IPEndPoint Address(object value)
        {
            var address = value as string;
            if (string.IsNullOrEmpty(address)) return null;
            var parts = address.Split(':');
            IPAddress ip;
            int port;
            if (parts.Length != 2 || !IPAddress.TryParse(parts[0], out ip) || !int.TryParse(parts[1], out port)) return null;
            return new IPEndPoint(ip, port);
        }

        // Reads a list field such as "relayAddresses", falling back to the single legacy field an older API sends
        internal static List<IPEndPoint> ReadAddresses(Dictionary<string, object> data, string listField, string singleField)
        {
            var result = new List<IPEndPoint>();
            object list;
            if (data.TryGetValue(listField, out list) && list is object[])
            {
                foreach (var item in (object[])list)
                {
                    var address = Address(item);
                    if (address != null) result.Add(address);
                }
            }
            if (result.Count == 0)
            {
                object single;
                var address = data.TryGetValue(singleField, out single) ? Address(single) : null;
                if (address != null) result.Add(address);
            }
            return result;
        }
    }

    // One relay's address and the launcher's own echo-test result against it
    class RelayLeg
    {
        public readonly IPEndPoint Address;
        public RelayQuality Quality = RelayQuality.Unknown;

        public RelayLeg(IPEndPoint address)
        {
            Address = address;
        }

        // The wire shape both the host poll and the join body send under "relays"; null while still unmeasured
        public Dictionary<string, object> Encode()
        {
            if (Quality.Loss < 0) return null;
            var entry = new Dictionary<string, object> { { "address", Address.ToString() }, { "loss", Quality.Loss } };
            if (Quality.Rtt >= 0) entry["rtt"] = Quality.Rtt;
            return entry;
        }

        // Parses the per-relay list a room or join answer carries (e.g. "hostRelays"), or an empty list when absent
        internal static List<RelayLeg> ParseList(object value)
        {
            var result = new List<RelayLeg>();
            if (!(value is object[])) return result;
            foreach (Dictionary<string, object> item in (object[])value)
            {
                var address = RelayTicket.Address(item.ContainsKey("address") ? item["address"] : null);
                if (address == null) continue;
                var leg = new RelayLeg(address);
                object rtt, loss;
                leg.Quality = new RelayQuality
                {
                    Rtt = item.TryGetValue("rtt", out rtt) && rtt != null ? Convert.ToInt32(rtt) : -1,
                    Loss = item.TryGetValue("loss", out loss) && loss != null ? Convert.ToInt32(loss) : -1,
                };
                result.Add(leg);
            }
            return result;
        }

        // The non-null encodings of a measured leg list, ready to send as the "relays" field
        internal static List<Dictionary<string, object>> Encode(List<RelayLeg> legs)
        {
            var result = new List<Dictionary<string, object>>();
            foreach (var leg in legs)
            {
                var encoded = leg.Encode();
                if (encoded != null) result.Add(encoded);
            }
            return result;
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

        // The account Steam is signed in with, as the 32-bit ID the game API uses; 0 when Steam is not running
        public static long SteamAccountId()
        {
            var value = Registry.GetValue(@"HKEY_CURRENT_USER\Software\Valve\Steam\ActiveProcess", "ActiveUser", null);
            return value is int ? (uint)(int)value : 0;
        }
    }
}
