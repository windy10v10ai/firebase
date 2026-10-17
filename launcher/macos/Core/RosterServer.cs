using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

namespace Windy10v10AI.Launcher
{
    class RosterServer : IDisposable
    {
        public const int Port = 27080;

        readonly TcpListener listener = new TcpListener(IPAddress.Loopback, Port);
        readonly Func<List<RosterEntry>> source;
        readonly Func<int> maxPlayers;
        volatile bool closed;

        public RosterServer(Func<List<RosterEntry>> source, Func<int> maxPlayers)
        {
            this.source = source;
            this.maxPlayers = maxPlayers;
        }

        // 玩家列表服务不可用不应阻止游戏服务器启动。
        public void Start()
        {
            try
            {
                NativeMethods.KeepPrivate(listener.Server);
                listener.Start();
            }
            catch (SocketException)
            {
                return;
            }
            new Thread(Serve) { IsBackground = true }.Start();
        }

        void Serve()
        {
            while (!closed)
            {
                try
                {
                    using (var client = listener.AcceptTcpClient())
                    {
                        client.ReceiveTimeout = 2000;
                        var stream = client.GetStream();
                        // 请求内容不影响响应，仅读取以完成连接交互。
                        #pragma warning disable CA2022 // 响应与请求内容无关，无需完整解析请求。
                        stream.Read(new byte[4096], 0, 4096);
#pragma warning restore CA2022
                        var body = Encoding.UTF8.GetBytes(Body());
                        var head = Encoding.ASCII.GetBytes("HTTP/1.1 200 OK\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: " + body.Length + "\r\nConnection: close\r\n\r\n");
                        stream.Write(head, 0, head.Length);
                        stream.Write(body, 0, body.Length);
                    }
                }
                catch (Exception)
                {
                    // 单次请求失败不应中断其他玩家的列表查询。
                }
            }
        }

        string Body()
        {
            var entering = new List<string>();
            var inGame = 0;
            foreach (var entry in source())
            {
                if (entry.Status == PlayerStatus.InGame) inGame++;
                else if (!entry.IsHost && (entry.Status == PlayerStatus.Connecting || entry.Status == PlayerStatus.Loading)) entering.Add(entry.Name ?? "");
            }
            return new JavaScriptSerializer().Serialize(new Dictionary<string, object>
            {
                { "entering", entering },
                { "inGame", inGame },
                { "maxPlayers", maxPlayers() },
            });
        }

        public void Dispose()
        {
            closed = true;
            listener.Stop();
        }
    }
}
