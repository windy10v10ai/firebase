using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

namespace Windy10v10AI.Launcher
{
    // Tells the game's lobby screen, which runs on this machine's dedicated server, who is still joining and how full the room is.
    // Bound to loopback only, so nothing outside this computer can reach it and Windows never asks about the firewall
    class RosterServer : IDisposable
    {
        // Agreed with the game, which reads it during team selection
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

        // A port already in use only costs the lobby its list of incoming players
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
                        // Every request gets the same answer, so the request itself is read only to be polite to the sender
                        stream.Read(new byte[4096], 0, 4096);
                        var body = Encoding.UTF8.GetBytes(Body());
                        var head = Encoding.ASCII.GetBytes("HTTP/1.1 200 OK\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: " + body.Length + "\r\nConnection: close\r\n\r\n");
                        stream.Write(head, 0, head.Length);
                        stream.Write(body, 0, body.Length);
                    }
                }
                catch (Exception)
                {
                    // A closed listener ends the loop; a broken request only loses that one answer
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
