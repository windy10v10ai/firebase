using System;
using System.Collections.Generic;
using System.Threading;

namespace Windy10v10AI.Launcher
{
    // Untested is for full rooms, which are not worth a probe until a slot opens.
    // Probes never use the relay, so Unreachable only means no direct route and the room can still be joined
    enum ProbeState { Untested, Testing, Reachable, Unreachable }

    // Header and Empty are captions inside the list; only Waiting rows can be joined
    enum RowKind { Waiting, Playing, Own, Header, Empty }

    class RoomAvatar
    {
        public string Url;
        public string Name;
    }

    class RoomRow
    {
        public RowKind Kind;
        public string Text;
        public string Code;
        public string Name;
        public string AvatarUrl;
        public string Map;
        public int Players;
        public int MaxPlayers;
        public ProbeState Probe;
        public int Rtt = -1;
        // Per-relay echo results the host reported; empty when the host is on an older API
        public List<RelayLeg> HostRelays = new List<RelayLeg>();
        // The legacy single-relay figure, read when HostRelays is empty
        public int HostRelayRtt = -1;
        // Estimated from both sides' round trips to a shared relay, since probes never go through it
        public int RelayRtt = -1;
        // Host first; a friends game carries none, so the list draws one blank figure per player
        public List<RoomAvatar> Avatars = new List<RoomAvatar>();
        public bool Friends;
        public int Minutes = -1;

        // The latency a join will most likely see, or -1 while unknown
        public int Latency
        {
            get { return Probe == ProbeState.Reachable ? Rtt : (Probe == ProbeState.Unreachable ? RelayRtt : -1); }
        }

        public bool Full
        {
            get { return MaxPlayers > 0 && Players >= MaxPlayers; }
        }

        public bool Joinable
        {
            get { return Kind == RowKind.Waiting && (Probe == ProbeState.Reachable || Probe == ProbeState.Unreachable) && !Full; }
        }

        public RoomRow Copy()
        {
            var copy = (RoomRow)MemberwiseClone();
            copy.Avatars = new List<RoomAvatar>(Avatars);
            return copy;
        }
    }

    // One visit to the join page: the public room list, and a probe of each room on the socket a later join reuses.
    // A host only looks, since it cannot join anyone while its own room is open
    class RoomBrowser : IDisposable
    {
        public readonly bool Probing;
        readonly Func<Dictionary<string, object>> listBody;
        readonly Func<List<Candidate>, bool?, Dictionary<string, object>> peerBody;
        readonly object sync = new object();
        readonly List<RoomRow> rows = new List<RoomRow>();
        List<RoomRow> games = new List<RoomRow>();
        readonly ManualResetEvent ready = new ManualResetEvent(false);
        JoinTunnel tunnel;
        List<Candidate> candidates;
        int refreshing;
        volatile bool disposed;
        int relayMeasuring;
        List<RelayLeg> ownRelays = new List<RelayLeg>();

        public bool? SymmetricNat;
        public bool Loaded;
        public bool LoadFailed;
        // Raised on worker threads
        public event Action Changed;

        public RoomBrowser(Func<Dictionary<string, object>> listBody, Func<List<Candidate>, bool?, Dictionary<string, object>> peerBody, bool probing)
        {
            this.listBody = listBody;
            this.peerBody = peerBody;
            Probing = probing;
        }

        public void Start()
        {
            if (!Probing)
            {
                ready.Set();
                return;
            }
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
                    var playing = new List<RoomRow>();
                    object value;
                    if (answer.TryGetValue("games", out value) && value is object[])
                    {
                        foreach (Dictionary<string, object> game in (object[])value) playing.Add(ParseGame(game));
                    }
                    var toProbe = new List<string>();
                    lock (sync)
                    {
                        Merge(fresh);
                        games = playing;
                        // A row keeps its result while it stays listed, so only rooms that are new or came back are measured
                        foreach (var row in rows)
                        {
                            if (!Probing || row.Probe != ProbeState.Untested || row.Full) continue;
                            row.Probe = ProbeState.Testing;
                            toProbe.Add(row.Code);
                        }
                        Loaded = true;
                        LoadFailed = false;
                    }
                    var relays = RelayTicket.ReadAddresses(answer, "relayAddresses", "relayAddress");
                    if (Probing && relays.Count > 0 && Interlocked.Exchange(ref relayMeasuring, 1) == 0)
                    {
                        new Thread(() => MeasureRelays(relays)) { IsBackground = true }.Start();
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
            var row = new RoomRow
            {
                Code = (string)room["code"],
                Name = room.TryGetValue("personaName", out value) ? value as string : null,
                AvatarUrl = room.TryGetValue("avatarUrl", out value) ? value as string : null,
                Map = room.TryGetValue("map", out value) ? value as string : null,
                Players = room.TryGetValue("playerCount", out value) && value != null ? Convert.ToInt32(value) : 0,
                MaxPlayers = room.TryGetValue("maxPlayers", out value) && value != null ? Convert.ToInt32(value) : 0,
                HostRelays = RelayLeg.ParseList(room.TryGetValue("hostRelays", out value) ? value : null),
                HostRelayRtt = room.TryGetValue("hostRelayRtt", out value) && value != null ? Convert.ToInt32(value) : -1,
            };
            row.Avatars = ParseAvatars(room);
            // An API without the player list still names the host
            if (row.Avatars.Count == 0) row.Avatars.Add(new RoomAvatar { Url = row.AvatarUrl, Name = row.Name });
            return row;
        }

        static RoomRow ParseGame(Dictionary<string, object> game)
        {
            object value;
            return new RoomRow
            {
                Kind = RowKind.Playing,
                Friends = !(game.TryGetValue("public", out value) && true.Equals(value)),
                Map = game.TryGetValue("map", out value) ? value as string : null,
                Players = game.TryGetValue("playerCount", out value) && value != null ? Convert.ToInt32(value) : 0,
                Minutes = game.TryGetValue("minutes", out value) && value != null ? Convert.ToInt32(value) : -1,
                Avatars = ParseAvatars(game),
            };
        }

        static List<RoomAvatar> ParseAvatars(Dictionary<string, object> data)
        {
            var list = new List<RoomAvatar>();
            object value;
            if (!data.TryGetValue("players", out value) || !(value is object[])) return list;
            foreach (Dictionary<string, object> player in (object[])value)
            {
                object field;
                list.Add(new RoomAvatar
                {
                    Url = player.TryGetValue("avatarUrl", out field) ? field as string : null,
                    Name = player.TryGetValue("personaName", out field) ? field as string : null,
                });
            }
            return list;
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

        // Measured once per visit on the probing socket, which is the one a later join takes over.
        // Relays are tried one at a time (the socket serializes them anyway) and published as each one finishes
        void MeasureRelays(List<System.Net.IPEndPoint> relays)
        {
            ready.WaitOne();
            JoinTunnel socket;
            lock (sync) socket = tunnel;
            if (socket == null || disposed) return;
            var legs = new List<RelayLeg>();
            foreach (var relay in relays)
            {
                legs.Add(new RelayLeg(relay) { Quality = socket.MeasureRelay(relay) });
                lock (sync) ownRelays = new List<RelayLeg>(legs);
                Raise();
            }
        }

        // Public games first, then friends games, each longest running first as the API sends them
        public List<RoomRow> Games()
        {
            List<RoomRow> list;
            lock (sync) list = games.ConvertAll(r => r.Copy());
            var ordered = list.FindAll(r => !r.Friends);
            ordered.AddRange(list.FindAll(r => r.Friends));
            return ordered;
        }

        // Directly reachable rooms first, the fuller and closer the better; rooms still testing next; then rooms only the relay reaches; full last
        public List<RoomRow> Snapshot()
        {
            List<RoomRow> list;
            lock (sync)
            {
                list = rows.ConvertAll(r => r.Copy());
                var own = new List<RelayLeg>(ownRelays);
                foreach (var row in list) row.RelayRtt = EstimateRelayRtt(row, own);
            }
            list.Sort((a, b) =>
            {
                var rank = Rank(a).CompareTo(Rank(b));
                if (rank != 0) return rank;
                if (a.Players != b.Players) return b.Players.CompareTo(a.Players);
                if (a.Joinable && a.Latency != b.Latency) return a.Latency.CompareTo(b.Latency);
                return string.CompareOrdinal(a.Code, b.Code);
            });
            return list;
        }

        static int Rank(RoomRow row)
        {
            if (row.Full) return 3;
            if (row.Probe == ProbeState.Reachable) return 0;
            if (row.Probe == ProbeState.Unreachable) return 2;
            return 1;
        }

        // The lowest sum of a host leg and the matching own leg to the same relay, ignoring any leg lossy enough to be unusable.
        // Falls back to the legacy single-relay figure when either side lacks per-relay detail, assuming the host is as far as we are
        internal static int EstimateRelayRtt(RoomRow row, List<RelayLeg> own)
        {
            const int MaxUsableLossPercent = 10;
            var best = -1;
            foreach (var hostLeg in row.HostRelays)
            {
                if (hostLeg.Quality.Rtt < 0 || hostLeg.Quality.Loss > MaxUsableLossPercent) continue;
                var ownLeg = own.Find(leg => leg.Address.Equals(hostLeg.Address));
                if (ownLeg == null || ownLeg.Quality.Rtt < 0 || ownLeg.Quality.Loss > MaxUsableLossPercent) continue;
                var sum = hostLeg.Quality.Rtt + ownLeg.Quality.Rtt;
                if (best < 0 || sum < best) best = sum;
            }
            if (best >= 0) return best;
            var ownRtt = own.Count > 0 ? own[0].Quality.Rtt : -1;
            if (ownRtt < 0) return -1;
            return ownRtt + (row.HostRelayRtt >= 0 ? row.HostRelayRtt : ownRtt);
        }

        // Hands the probing socket to a join, so the host already knows the address the join comes from.
        // Returns null when gathering failed and the join has to open its own
        public List<RelayLeg> OwnRelays
        {
            get { lock (sync) return new List<RelayLeg>(ownRelays); }
        }

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
