using System;
using System.Collections.Generic;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;

namespace Windy10v10AI.Launcher
{
    static class PathType
    {
        public const string Lan = "lan";
        public const string Upnp = "upnp";
        public const string Stun = "stun";
        public const string Relay = "relay";

        // 路径索引参与协议传输，保留未使用的索引以兼容其他启动器。
        public static readonly string[] Preference = { Lan, Upnp, Stun, Relay };

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

    class RelayTicket
    {
        public readonly List<IPEndPoint> Addresses;
        public readonly string Ticket;

        RelayTicket(List<IPEndPoint> addresses, string ticket)
        {
            Addresses = addresses;
            Ticket = ticket;
        }

        public static RelayTicket Read(Dictionary<string, object> answer)
        {
            var relay = answer.ContainsKey("relay") ? answer["relay"] as Dictionary<string, object> : null;
            if (relay == null) return null;
            var ticket = relay.ContainsKey("ticket") ? relay["ticket"] as string : null;
            var addresses = ReadAddresses(relay, "addresses", "address");
            if (addresses.Count == 0 || string.IsNullOrEmpty(ticket)) return null;
            return new RelayTicket(addresses, ticket);
        }

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

    // 线路切换阈值由服务端提供，以便无需发布启动器即可调整。
    class RouteThresholds
    {
        public int DirectLossPct = -1;
        public int RelayLossPct = -1;
        public int LossCostMs = -1;
        public int SwitchMarginMs = -1;

        public static RouteThresholds Read(Dictionary<string, object> answer)
        {
            object value;
            var check = answer.TryGetValue("routeCheck", out value) ? value as Dictionary<string, object> : null;
            if (check == null) return null;
            var limits = new RouteThresholds
            {
                DirectLossPct = Field(check, "directLossPct"),
                RelayLossPct = Field(check, "relayLossPct"),
                LossCostMs = Field(check, "lossCostMs"),
                SwitchMarginMs = Field(check, "switchMarginMs"),
            };
            var scored = limits.LossCostMs >= 0 && limits.SwitchMarginMs >= 0;
            var legacy = limits.DirectLossPct >= 0 && limits.RelayLossPct >= 0;
            return scored || legacy ? limits : null;
        }

        static int Field(Dictionary<string, object> check, string name)
        {
            object value;
            return check.TryGetValue(name, out value) && value != null ? Convert.ToInt32(value) : -1;
        }

        public bool PrefersRelay(RouteQuality direct, RouteQuality relay)
        {
            if (direct.Samples == 0 || relay.Samples == 0 || relay.Rtt < 0) return false;
            if (LossCostMs < 0 || SwitchMarginMs < 0) return direct.Loss >= DirectLossPct && relay.Loss <= RelayLossPct;
            return Score(direct) - Score(relay) > SwitchMarginMs;
        }

        // 完全无响应的直连路径可仅按丢包惩罚评分，避免缺失延迟干扰比较。
        int Score(RouteQuality quality)
        {
            return Math.Max(quality.Rtt, 0) + (quality.Loss * LossCostMs);
        }
    }

    class RelayLeg
    {
        public readonly IPEndPoint Address;
        public RelayQuality Quality = RelayQuality.Unknown;

        public RelayLeg(IPEndPoint address)
        {
            Address = address;
        }

        public Dictionary<string, object> Encode()
        {
            if (Quality.Loss < 0) return null;
            var entry = new Dictionary<string, object> { { "address", Address.ToString() }, { "loss", Quality.Loss } };
            if (Quality.Rtt >= 0) entry["rtt"] = Quality.Rtt;
            return entry;
        }

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

        // 缺少网关的适配器不能作为其他电脑可达的候选路径。
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

        // STUN 与隧道共用接收套接字，地址探测必须在接收循环开始前完成。
        // 映射端口随目标变化时，打洞路径不可依赖。
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
                // 单个 STUN 服务不可达不应阻止尝试其他服务。
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

        public static long SteamAccountId()
        {
            return MacInstall.AccountId();
        }
    }
}
