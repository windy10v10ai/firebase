namespace Windy10v10AI.Launcher
{
    sealed class MacRooms : IDisposable
    {
        readonly Action<object> emit;
        readonly HostSession host;
        RoomBrowser browser;
        Timer refresh;

        public MacRooms(Action<object> emit, HostSession host)
        {
            this.emit = emit;
            this.host = host;
        }

        public void Start()
        {
            bool probing = !host.Active;
            if (browser != null && browser.Probing == probing) { Refresh(); return; }
            Dispose();
            var created = new RoomBrowser(ListBody, (candidates, symmetric) => HostSession.PeerBody(new MacInstall { Manifest = MapVersion() }, candidates, symmetric), probing);
            browser = created;
            created.Changed += () => { if (browser == created) Publish(created); };
            Publish(created);
            created.Start();
            created.Refresh();
            refresh = new Timer(_ => created.Refresh(), null, TimeSpan.FromSeconds(10), TimeSpan.FromSeconds(10));
        }

        public void Refresh()
        {
            browser?.Refresh();
        }

        public RoomBrowser TakeForJoin()
        {
            refresh?.Dispose(); refresh = null;
            var taken = browser; browser = null;
            return taken;
        }

        public void Dispose()
        {
            refresh?.Dispose(); refresh = null;
            var old = browser; browser = null;
            old?.Dispose();
        }

        static string MapVersion()
        {
            try { return MacInstall.Find().Manifest; } catch { return null; }
        }

        static Dictionary<string, object> ListBody() => new()
        {
            ["steamId"] = Platform.SteamAccountId(),
            ["protocolVersion"] = RoomApi.ProtocolVersion,
            ["mapVersion"] = MapVersion()
        };

        void Publish(RoomBrowser source)
        {
            var waiting = source.Snapshot();
            var games = source.Games();
            var rows = new List<RoomRow>();
            if (host.Active && !host.Solo && host.Code != null)
            {
                var players = host.Roster.Snapshot().Where(e => e.Status != PlayerStatus.Left && e.Status != PlayerStatus.Failed).ToList();
                rows.Add(new RoomRow { Kind = RowKind.Own, Code = host.Code, Name = Strings.YourRoom, Map = host.Difficulty, Players = players.Count, MaxPlayers = host.MaxPlayers, Friends = !host.PublicRoom, Avatars = players.Select(e => new RoomAvatar { Name = e.Name, Url = e.AvatarUrl }).ToList() });
                waiting.RemoveAll(r => r.Code == host.Code);
                games.RemoveAll(r => r.Code == host.Code);
            }
            rows.AddRange(waiting);
            rows.AddRange(games);
            emit(new { type = "rooms", loading = !source.Loaded && !source.LoadFailed, failed = source.LoadFailed, lookOnly = host.Active, count = waiting.Count, rows = rows.Select(r => new { code = r.Code, name = r.Name, map = r.Map, playerCount = r.Players, maxPlayers = r.MaxPlayers, probe = (int)r.Probe, rtt = r.Rtt, relayRtt = r.RelayRtt, latency = r.Latency, started = r.Kind == RowKind.Playing, minutes = r.Minutes, kind = (int)r.Kind, friends = r.Friends, joinable = r.Joinable, avatars = r.Avatars.Select(a => new { name = a.Name, url = a.Url }).ToArray() }).ToArray() });
        }
    }
}
