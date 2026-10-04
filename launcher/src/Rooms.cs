using System;
using System.Collections.Generic;
using System.Threading;

namespace Windy10v10AI.Launcher
{
    // Untested is for full rooms, which are not worth a probe until a slot opens
    enum ProbeState { Untested, Testing, Reachable, Unreachable }

    class RoomRow
    {
        public string Code;
        public string Name;
        public string AvatarUrl;
        public string Map;
        public int Players;
        public int MaxPlayers;
        public ProbeState Probe;
        public int Rtt = -1;

        public bool Full
        {
            get { return MaxPlayers > 0 && Players >= MaxPlayers; }
        }

        public bool Joinable
        {
            get { return Probe == ProbeState.Reachable && !Full; }
        }

        public RoomRow Copy()
        {
            return (RoomRow)MemberwiseClone();
        }
    }

    // One visit to the join page: the public room list, and a probe of each room on the socket a later join reuses
    class RoomBrowser : IDisposable
    {
        readonly Func<Dictionary<string, object>> listBody;
        readonly Func<List<Candidate>, bool?, Dictionary<string, object>> peerBody;
        readonly object sync = new object();
        readonly List<RoomRow> rows = new List<RoomRow>();
        readonly ManualResetEvent ready = new ManualResetEvent(false);
        JoinTunnel tunnel;
        List<Candidate> candidates;
        int refreshing;
        volatile bool disposed;

        public bool? SymmetricNat;
        public bool Loaded;
        public bool LoadFailed;
        // Raised on worker threads
        public event Action Changed;

        public RoomBrowser(Func<Dictionary<string, object>> listBody, Func<List<Candidate>, bool?, Dictionary<string, object>> peerBody)
        {
            this.listBody = listBody;
            this.peerBody = peerBody;
        }

        public void Start()
        {
            new Thread(() =>
            {
                var gathered = new JoinTunnel();
                try
                {
                    bool publicIp;
                    var list = gathered.Gather(out publicIp);
                    gathered.Start();
                    lock (sync)
                    {
                        if (!disposed)
                        {
                            tunnel = gathered;
                            candidates = list;
                            SymmetricNat = gathered.SymmetricNat;
                            gathered = null;
                        }
                    }
                }
                catch (Exception)
                {
                    // Without a socket every probe fails, and joining opens its own
                }
                finally
                {
                    if (gathered != null) gathered.Dispose();
                    ready.Set();
                }
                Raise();
            }) { IsBackground = true }.Start();
        }

        public void Refresh()
        {
            if (Interlocked.Exchange(ref refreshing, 1) == 1) return;
            new Thread(() =>
            {
                try
                {
                    var answer = RoomApi.List(listBody());
                    var fresh = new List<RoomRow>();
                    foreach (Dictionary<string, object> room in (object[])answer["rooms"]) fresh.Add(Parse(room));
                    var toProbe = new List<string>();
                    lock (sync)
                    {
                        Merge(fresh);
                        // A row keeps its result while it stays listed, so only rooms that are new or came back are measured
                        foreach (var row in rows)
                        {
                            if (row.Probe != ProbeState.Untested || row.Full) continue;
                            row.Probe = ProbeState.Testing;
                            toProbe.Add(row.Code);
                        }
                        Loaded = true;
                        LoadFailed = false;
                    }
                    foreach (var code in toProbe)
                    {
                        var target = code;
                        new Thread(() => Measure(target)) { IsBackground = true }.Start();
                    }
                }
                catch (Exception)
                {
                    lock (sync) LoadFailed = true;
                }
                finally
                {
                    Interlocked.Exchange(ref refreshing, 0);
                }
                Raise();
            }) { IsBackground = true }.Start();
        }

        static RoomRow Parse(Dictionary<string, object> room)
        {
            object value;
            return new RoomRow
            {
                Code = (string)room["code"],
                Name = room.TryGetValue("personaName", out value) ? value as string : null,
                AvatarUrl = room.TryGetValue("avatarUrl", out value) ? value as string : null,
                Map = room.TryGetValue("map", out value) ? value as string : null,
                Players = room.TryGetValue("playerCount", out value) && value != null ? Convert.ToInt32(value) : 0,
                MaxPlayers = room.TryGetValue("maxPlayers", out value) && value != null ? Convert.ToInt32(value) : 0,
            };
        }

        // A room keeps its measured latency across refreshes, since the route to it does not change
        void Merge(List<RoomRow> fresh)
        {
            var merged = new List<RoomRow>();
            foreach (var row in fresh)
            {
                var old = rows.Find(r => r.Code == row.Code);
                if (old != null)
                {
                    row.Probe = old.Probe;
                    row.Rtt = old.Rtt;
                }
                merged.Add(row);
            }
            rows.Clear();
            rows.AddRange(merged);
        }

        void Measure(string code)
        {
            ready.WaitOne();
            JoinTunnel socket;
            List<Candidate> own;
            lock (sync)
            {
                socket = tunnel;
                own = candidates;
            }
            var rtt = -1;
            var gone = false;
            if (socket != null && !disposed)
            {
                try
                {
                    var body = peerBody(own, SymmetricNat);
                    body["probe"] = true;
                    var answer = RoomApi.Join(code, body);
                    var hosts = new List<Candidate>();
                    foreach (var text in (object[])answer["hostCandidates"]) hosts.Add(Candidate.Parse((string)text));
                    rtt = socket.Measure((string)answer["joinToken"], hosts);
                }
                catch (RoomError error)
                {
                    gone = error.Code == "room_not_found" || error.Code == "game_started";
                }
                catch (Exception)
                {
                }
            }
            lock (sync)
            {
                var row = rows.Find(r => r.Code == code);
                if (row != null && gone) rows.Remove(row);
                else if (row != null)
                {
                    row.Rtt = rtt;
                    row.Probe = rtt >= 0 ? ProbeState.Reachable : ProbeState.Unreachable;
                }
            }
            Raise();
        }

        // Joinable rooms first, the fuller and closer the better; rooms still testing next; unreachable and full last
        public List<RoomRow> Snapshot()
        {
            List<RoomRow> list;
            lock (sync) list = rows.ConvertAll(r => r.Copy());
            list.Sort((a, b) =>
            {
                var rank = Rank(a).CompareTo(Rank(b));
                if (rank != 0) return rank;
                if (a.Players != b.Players) return b.Players.CompareTo(a.Players);
                if (a.Joinable && a.Rtt != b.Rtt) return a.Rtt.CompareTo(b.Rtt);
                return string.CompareOrdinal(a.Code, b.Code);
            });
            return list;
        }

        static int Rank(RoomRow row)
        {
            if (row.Joinable) return 0;
            if (!row.Full && row.Probe != ProbeState.Unreachable) return 1;
            return 2;
        }

        // Hands the probing socket to a join, so the host already knows the address the join comes from.
        // Returns null when gathering failed and the join has to open its own
        public JoinTunnel TakeTunnel(out List<Candidate> gathered)
        {
            ready.WaitOne();
            lock (sync)
            {
                var taken = tunnel;
                tunnel = null;
                gathered = candidates;
                return taken;
            }
        }

        void Raise()
        {
            var handler = Changed;
            if (handler != null && !disposed) handler();
        }

        public void Dispose()
        {
            disposed = true;
            lock (sync)
            {
                if (tunnel != null) tunnel.Dispose();
                tunnel = null;
            }
        }
    }
}
