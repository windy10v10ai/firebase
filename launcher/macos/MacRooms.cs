namespace Windy10v10AI.Launcher
{
    sealed class MacRooms : IDisposable
    {
        readonly Action<object> emit;
        readonly HostSession host;
        RoomBrowser browser;
        Timer refresh;
        int badgeLoading;

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
            var created = new RoomBrowser(ListBody, (edition, candidates, symmetric) => RoomPeer.Body(MacInstall.AccountId(), MapVersion(edition), candidates, symmetric, edition), probing);
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

        public void RefreshBadge()
        {
            if (Interlocked.Exchange(ref badgeLoading, 1) == 1) return;
            var own = host.Active ? host.Code : null;
            _ = Task.Run(() =>
            {
                try
                {
                    var answer = RoomApi.List(ListBody());
                    var count = 0;
                    foreach (Dictionary<string, object> room in (object[])answer["rooms"])
                    {
                        if ((string)room["code"] != own) count++;
                    }
                    emit(new { type = "badge", count });
                }
                catch (Exception) { }
                finally { Interlocked.Exchange(ref badgeLoading, 0); }
            });
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

        static string MapVersion(string edition)
        {
            try { return MacInstall.Find(true, edition).Manifest; } catch { return null; }
        }

        static Dictionary<string, object> ListBody() => new()
        {
            ["steamId"] = Platform.SteamAccountId(),
            ["protocolVersion"] = RoomApi.ProtocolVersion,
            // Older APIs only read mapVersion, as the original edition's map
            ["mapVersion"] = MapVersion(Editions.Original),
            ["mapVersions"] = MapVersions()
        };

        // An edition whose map is not installed is left out, since the API rejects null versions
        static Dictionary<string, object> MapVersions()
        {
            var versions = new Dictionary<string, object>();
            foreach (var edition in new[] { Editions.Original, Editions.Anime })
            {
                var version = MapVersion(edition);
                if (version != null) versions[edition] = version;
            }
            return versions;
        }

        void Publish(RoomBrowser source)
        {
            var waiting = source.Snapshot();
            var games = source.Games();
            var rows = new List<RoomRow>();
            if (host.Active && !host.Solo && host.Code != null)
            {
                var players = host.Roster.Snapshot().Where(e => e.Status != PlayerStatus.Left && e.Status != PlayerStatus.Failed).ToList();
                rows.Add(new RoomRow { Kind = RowKind.Own, Code = host.Code, Name = Strings.YourRoom, Map = host.Difficulty, Edition = host.Edition, Players = players.Count, MaxPlayers = host.MaxPlayers, Friends = !host.PublicRoom, Avatars = players.Select(e => new RoomAvatar { Name = e.Name, Url = e.AvatarUrl }).ToList() });
                waiting.RemoveAll(r => r.Code == host.Code);
                games.RemoveAll(r => r.Code == host.Code);
            }
            rows.AddRange(waiting);
            rows.AddRange(games);
            emit(new { type = "rooms", loading = !source.Loaded && !source.LoadFailed, failed = source.LoadFailed, lookOnly = host.Active, count = waiting.Count, rows = rows.Select(r => new { code = r.Code, name = r.Name, map = r.Map, edition = r.Edition, playerCount = r.Players, maxPlayers = r.MaxPlayers, probe = (int)r.Probe, rtt = r.Rtt, relayRtt = r.RelayRtt, latency = r.Latency, started = r.Kind == RowKind.Playing, minutes = r.Minutes, kind = (int)r.Kind, friends = r.Friends, joinable = r.Joinable, avatars = r.Avatars.Select(a => new { name = a.Name, url = a.Url }).ToArray() }).ToArray() });
        }
    }
}
