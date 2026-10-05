// Windy10v10AI local dedicated server launcher.
// Built with the .NET Framework 4 compiler that ships with Windows, so the language level is C# 5.
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

[assembly: System.Reflection.AssemblyTitle("Windy10v10AI Launcher")]
[assembly: System.Reflection.AssemblyProduct("Windy10v10AI Launcher")]
[assembly: System.Reflection.AssemblyCompany("Windy10v10AI")]
[assembly: System.Reflection.AssemblyCopyright("Copyright (c) 2026 Windy10v10AI")]
[assembly: System.Reflection.AssemblyDescription("Runs a local Dota 2 dedicated server for the 10v10 AI custom game")]
[assembly: System.Reflection.AssemblyVersion("0.5.1.0")]
[assembly: System.Reflection.AssemblyFileVersion("0.5.1.0")]

namespace Windy10v10AI.Launcher
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Updater.RemoveOld();
            Avatars.RemoveUnused();
            Application.Run(new MainForm());
        }
    }

    class LaunchError : Exception
    {
        public readonly bool ShowLog;
        public string Button;
        public Action OnClick;

        public LaunchError(string message, bool showLog) : base(message)
        {
            ShowLog = showLog;
        }
    }

    class MainForm : Form
    {
        const string Version = "0.5.1";
        const string ReleaseId = "2307479570";
        const string TestId = "2636824668";
        const int Port = 27015;
        const int SlowSeconds = 60;
        const int TimeoutSeconds = 180;
        const int ErrorAccessDenied = 5;
        const int ErrorElevationRequired = 740;
        // The game turns off its auto start when the dedicated server carries this name
        const string RoomHostname = "windy10v10ai-room";
        const string HeroSelection = "DOTA_GAMERULES_STATE_HERO_SELECTION";
        // The game sends its results the moment a team wins, a few seconds before the post-game state
        const string ResultsSent = "/api/game/end";
        const string PostGame = "entering state 'DOTA_GAMERULES_STATE_POST_GAME'";
        // The game prints this once its results request has finally succeeded or failed
        const string ResultsDone = "[Game] end game callback";
        // An offline game never prints the callback, so the room cannot wait on it forever
        const int ResultsFallbackSeconds = 120;
        // Most friends join within minutes of the room opening, so polling is fast then and slower after
        const int FastPollMs = 2000;
        const int SlowPollMs = 5000;
        const int GamePollMs = 30000;
        const int FastPollMinutes = 5;
        // An idle room stops polling so it drops off the list; the host resumes it with one click if still there
        const int PauseMinutes = 15;
        const int ListRefreshMs = 30000;
        // A join page left open in the background stops asking the API for the list
        const int BrowseMinutes = 5;
        const int ListHeight = 216;

        static readonly string[] MapKeys = { "dota", "hard", "custom" };
        static readonly string[] MapNames = { "easy", "hard", "custom" };

        readonly float scale;
        readonly PictureBox banner = new PictureBox();
        readonly Label subtitle = new Label();
        readonly LinkLabel version = new LinkLabel();
        readonly ToolTip tooltip = new ToolTip();
        readonly NoticeBar notice = new NoticeBar();
        readonly ModeButton[] modes = { new ModeButton(), new ModeButton(), new ModeButton() };
        readonly Label status = new Label();
        readonly MarqueeBar marquee = new MarqueeBar();
        readonly Label hint = new Label();
        readonly FlatButton action = new FlatButton();
        readonly Panel divider = new Panel();
        readonly Panel mapDot = new Panel();
        readonly Label mapLabel = new Label();
        readonly LinkLabel devLink = new LinkLabel();
        readonly FeedbackButton feedbackLink = new FeedbackButton();
        readonly ToggleBox testBox = new ToggleBox();
        readonly SegmentedBar modeBar = new SegmentedBar();
        readonly Label roomTypeLabel = new Label();
        readonly SegmentedBar roomTypeBar = new SegmentedBar();
        readonly Label maxLabel = new Label();
        readonly FlatButton maxButton = new FlatButton();
        readonly ContextMenuStrip maxMenu = new ContextMenuStrip();
        readonly NoticeBar pauseBar = new NoticeBar();
        readonly Label roomsTitle = new Label();
        readonly Label roomsCount = new Label();
        readonly FlatButton refresh = new FlatButton();
        readonly RoomList roomList = new RoomList();
        readonly System.Windows.Forms.Timer listTimer = new System.Windows.Forms.Timer { Interval = ListRefreshMs };
        RoomBrowser browser;
        DateTime browseSince;
        readonly Label privatePrompt = new Label();
        readonly CodeInput codeBox = new CodeInput();
        readonly CodeDisplay hostCode = new CodeDisplay();
        readonly PlayerList players = new PlayerList();
        readonly InfoCard mapCard = new InfoCard();
        readonly System.Windows.Forms.Timer rosterTimer = new System.Windows.Forms.Timer { Interval = 1000 };
        bool playersShown;
        bool cardShown;
        long selfId;
        HostRoster hostRoster;
        readonly FlatButton joinButton = new FlatButton();
        readonly FlatButton secondary = new FlatButton();
        Action secondaryAction;
        HostTunnel hostTunnel;
        RosterServer rosterServer;
        JoinTunnel joinTunnel;
        readonly List<Dictionary<string, object>> joinResults = new List<Dictionary<string, object>>();
        // The room this launcher hosts; the poll thread reads them again when the host resumes a paused room
        string roomCode;
        string roomToken;
        string roomMap;
        Dictionary<string, object> roomBody;
        readonly HashSet<string> seenJoins = new HashSet<string>();
        readonly List<long> kicked = new List<long>();
        bool paused;
        bool hostingReady;
        readonly NoticeBar hostGuide = new NoticeBar();
        bool clientClosed;
        bool saving;
        // Shown once the window is back to idle, so a finished game does not end on a blank screen
        string endNotice;
        bool? hostSymmetric;
        bool? joinSymmetric;

        readonly System.Windows.Forms.Timer mapPoll = new System.Windows.Forms.Timer { Interval = 5000 };
        Process server;
        Action noticeAction;
        // Launch failures stay on screen until the player acts; map checks may replace any other notice
        bool stickyNotice;
        string logFile;
        // The last launch failure, so a report started from its notice can carry it
        FeedbackError failure;
        string stage;
        Exception failureCause;
        readonly System.Windows.Forms.Timer thanksTimer = new System.Windows.Forms.Timer { Interval = 6000 };
        Release update;
        volatile bool stopping;
        bool busy;

        public MainForm()
        {
            scale = Theme.Dpi / 96f;
            Text = Strings.Title;
            Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            FormBorderStyle = FormBorderStyle.FixedSingle;
            MaximizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            AutoScaleMode = AutoScaleMode.None;
            BackColor = Theme.Background;
            ForeColor = Theme.Text;
            Font = new Font(Theme.FontName, 9f);

            banner.SizeMode = PictureBoxSizeMode.Zoom;
            banner.BackColor = Color.Black;
            using (var stream = typeof(MainForm).Assembly.GetManifestResourceStream("banner.jpg"))
            {
                banner.Image = Image.FromStream(stream);
            }

            subtitle.Text = Strings.Subtitle;
            subtitle.Font = new Font(Theme.FontName, 9.75f);
            subtitle.AutoEllipsis = true;
            version.Text = "v" + Version + " ↗";
            version.Font = new Font(Theme.FontName, 8.25f);
            version.LinkColor = Theme.Muted;
            version.ActiveLinkColor = Theme.Text;
            version.LinkBehavior = LinkBehavior.HoverUnderline;
            version.TextAlign = ContentAlignment.MiddleRight;
            version.LinkClicked += delegate { OpenUrl(Updater.DownloadPage + "#changelog"); };
            tooltip.SetToolTip(version, Strings.Changelog);
            notice.Visible = false;
            notice.Action.Click += delegate { if (noticeAction != null) noticeAction(); };

            string[] titles = { Strings.Easy, Strings.Hard, Strings.Custom };
            string[] subs = { "N1 ~ N5", "N6 ~ N8", Strings.CustomSub };
            for (var i = 0; i < modes.Length; i++)
            {
                var index = i;
                modes[i].Title = titles[i];
                modes[i].Sub = subs[i];
                modes[i].ActiveSub = Strings.StartingSub;
                modes[i].Click += delegate { OnModeClick(index); };
            }

            status.Text = Strings.Idle;
            status.ForeColor = Theme.Muted;
            status.Font = new Font(Theme.FontName, 9f);
            hint.ForeColor = Theme.Muted;
            hint.Font = new Font(Theme.FontName, 9f);
            marquee.Visible = false;
            hint.Visible = false;
            action.Visible = false;
            action.Click += delegate
            {
                if (saving && !ConfirmDialog.Ask(this, Strings.SavingCloseTitle, Strings.SavingCloseBody, Strings.StopAnyway)) return;
                StopServer();
            };
            hostGuide.Show(NoticeKind.Success, Strings.HostGuide, null);
            hostGuide.Visible = false;

            divider.BackColor = Theme.Border;
            mapDot.BackColor = Theme.Faint;
            mapLabel.ForeColor = Theme.Muted;
            mapLabel.Font = new Font(Theme.FontName, 9f);
            mapLabel.TextAlign = ContentAlignment.MiddleLeft;
            mapLabel.AutoEllipsis = true;

            devLink.Text = Strings.Developer;
            devLink.Font = new Font(Theme.FontName, 8.25f);
            devLink.LinkColor = Theme.Faint;
            devLink.ActiveLinkColor = Theme.Muted;
            devLink.LinkBehavior = LinkBehavior.HoverUnderline;
            devLink.TextAlign = ContentAlignment.MiddleRight;
            devLink.LinkClicked += delegate
            {
                testBox.Visible = !testBox.Visible;
                Relayout();
            };

            feedbackLink.Text = Strings.Feedback;
            feedbackLink.Click += delegate { OpenFeedback(null); };

            testBox.Text = Strings.UseTestMap;
            testBox.Visible = false;
            testBox.CheckedChanged += delegate { RefreshMapState(); };
#if BETA
            // Closed beta builds start on the test map so testers need no extra step
            testBox.Visible = true;
            testBox.Checked = true;
#endif

            // Only the screen comes back; a room is never opened without a click
            Settings.Load();
            modeBar.Items = new[] { Strings.Solo, Strings.HostRoom, Strings.JoinRoom };
            modeBar.Selected = Settings.Mode;
            status.Text = IdleText();
            modeBar.SelectedChanged += delegate
            {
                if (busy) return;
                Settings.Mode = modeBar.Selected;
                Settings.Save();
                status.Text = IdleText();
                RefreshMapState();
                Relayout();
                UpdateBrowsing();
                if (modeBar.Selected == 2) codeBox.FillFromClipboard();
            };
            mapCard.Action.Click += delegate { OpenUrl("steam://url/CommunityFilePage/" + MapId); };
            rosterTimer.Tick += delegate { RefreshPlayers(); };
            thanksTimer.Tick += delegate
            {
                thanksTimer.Stop();
                if (busy || status.Text != Strings.FeedbackThanks) return;
                status.Text = IdleText();
                status.ForeColor = Theme.Muted;
            };
            players.Kick += KickPlayer;

            roomTypeLabel.Text = Strings.RoomType;
            maxLabel.Text = Strings.MaxPlayers;
            foreach (var label in new[] { roomTypeLabel, maxLabel })
            {
                label.ForeColor = Theme.Muted;
                label.TextAlign = ContentAlignment.MiddleLeft;
            }
            roomTypeBar.Font = new Font(Theme.FontName, 9f);
            roomTypeBar.Items = new[] { Strings.PublicRoom, Strings.PrivateRoom };
            roomTypeBar.Selected = Settings.PublicRoom ? 0 : 1;
            roomTypeBar.SelectedChanged += delegate
            {
                Settings.PublicRoom = roomTypeBar.Selected == 0;
                Settings.Save();
                UpdateHostingHint();
                ApplyRoomType();
            };
            maxButton.BackColor = Theme.Panel;
            maxButton.TextAlign = ContentAlignment.MiddleCenter;
            maxButton.Click += delegate { ShowMaxMenu(); };
            maxMenu.Renderer = new ToolStripProfessionalRenderer(new DarkMenuColors());
            maxMenu.ShowImageMargin = false;
            maxMenu.ShowCheckMargin = true;
            for (var n = Settings.MinPlayers; n <= Settings.PlayerLimit; n++)
            {
                var value = n;
                var item = new ToolStripMenuItem(string.Format(Strings.PlayersOption, n)) { ForeColor = Theme.Text, Tag = n };
                item.Click += delegate
                {
                    Settings.MaxPlayers = value;
                    Settings.Save();
                    UpdateMaxButton();
                };
                maxMenu.Items.Add(item);
            }
            UpdateMaxButton();
            pauseBar.Visible = false;
            pauseBar.Action.Click += delegate { ResumeRoom(); };

            roomsTitle.Text = Strings.PublicRooms;
            roomsTitle.Font = new Font(Theme.FontName, 10.5f, FontStyle.Bold);
            roomsTitle.TextAlign = ContentAlignment.MiddleLeft;
            roomsCount.ForeColor = Theme.Muted;
            roomsCount.TextAlign = ContentAlignment.MiddleLeft;
            refresh.Text = Strings.Refresh;
            refresh.Click += delegate
            {
                if (browser == null) UpdateBrowsing();
                else browser.Refresh();
            };
            roomList.JoinRoom += OnJoinClick;
            listTimer.Tick += delegate
            {
                // Nobody is looking at a minimised, background or long-forgotten join page
                if (browser == null || busy || WindowState == FormWindowState.Minimized || ActiveForm != this) return;
                if ((DateTime.UtcNow - browseSince).TotalMinutes > BrowseMinutes) return;
                browser.Refresh();
            };
            privatePrompt.Text = Strings.PrivatePrompt;
            privatePrompt.ForeColor = Theme.Muted;
            privatePrompt.TextAlign = ContentAlignment.MiddleLeft;
            codeBox.Placeholder = Strings.CodeExample;
            codeBox.Submit += delegate { OnJoinClick(codeBox.Code); };
            codeBox.CodeChanged += delegate { UpdateJoinButton(); };
            hostCode.Visible = false;
            joinButton.Text = Strings.Join;
            joinButton.MakePrimary();
            joinButton.Click += delegate { OnJoinClick(codeBox.Code); };
            UpdateJoinButton();
            secondary.Visible = false;
            secondary.Click += delegate { if (secondaryAction != null) secondaryAction(); };

            Controls.AddRange(new Control[] { banner, subtitle, version, notice, hostGuide, status, marquee, hint, action, secondary, hostCode, players, pauseBar, mapCard, divider, mapDot, mapLabel, devLink, feedbackLink, testBox, modeBar, roomTypeLabel, roomTypeBar, maxLabel, maxButton, roomsTitle, roomsCount, refresh, roomList, privatePrompt, codeBox, joinButton });
            Controls.AddRange(modes);

            RefreshMapState();
            Relayout();

            // Players often subscribe or wait for Steam while the launcher is open, so idle state keeps itself current
            mapPoll.Tick += delegate { RefreshIdleMapState(); };
            mapPoll.Start();
            Activated += delegate
            {
                RefreshIdleMapState();
                if (!busy && modeBar.Selected == 2) codeBox.FillFromClipboard();
            };
            Shown += delegate { UpdateBrowsing(); };
            WorkshopLatest.Changed += delegate
            {
                if (IsHandleCreated && !IsDisposed) BeginInvoke((Action)RefreshIdleMapState);
            };
#if !BETA
            // Closed beta builds must not replace themselves with the public release
            Shown += delegate
            {
                new Thread(() =>
                {
                    var newer = Updater.FindNewer(Version);
                    if (newer != null) UI(() => { update = newer; RefreshIdleMapState(); });
                }) { IsBackground = true }.Start();
            };
#endif
        }

        void RefreshIdleMapState()
        {
            if (busy || (notice.Visible && stickyNotice)) return;
            RefreshMapState();
        }

        int P(float value)
        {
            return (int)Math.Round(value * scale);
        }

        void Relayout()
        {
            banner.SetBounds(0, 0, P(480), P(120));
            subtitle.SetBounds(P(20), P(132), P(370), P(22));
            version.SetBounds(P(390), P(132), P(70), P(22));
            var y = 162;
            modeBar.SetBounds(P(20), P(y), P(440), P(36));
            y += 48;
            // Room settings stay above the player list, because the host may change them while the room is open
            var settings = modeBar.Selected == 1 && !cardShown;
            roomTypeLabel.Visible = roomTypeBar.Visible = maxLabel.Visible = maxButton.Visible = settings;
            if (settings)
            {
                var typeWidth = TextRenderer.MeasureText(roomTypeLabel.Text, roomTypeLabel.Font).Width + P(4);
                roomTypeLabel.SetBounds(P(20), P(y), typeWidth, P(30));
                var segment = Math.Max(TextRenderer.MeasureText(Strings.PublicRoom, roomTypeBar.Font).Width, TextRenderer.MeasureText(Strings.PrivateRoom, roomTypeBar.Font).Width) + P(20);
                roomTypeBar.SetBounds(P(20) + typeWidth + P(6), P(y), Math.Max(P(140), 2 * segment + P(10)), P(30));
                var maxWidth = Math.Max(P(84), TextRenderer.MeasureText(maxButton.Text, maxButton.Font).Width + P(24));
                maxButton.SetBounds(P(460) - maxWidth, P(y), maxWidth, P(30));
                var labelWidth = TextRenderer.MeasureText(maxLabel.Text, maxLabel.Font).Width + P(4);
                maxLabel.SetBounds(maxButton.Left - P(6) - labelWidth, P(y), labelWidth, P(30));
                y += 42;
            }
            // Joining needs no difficulty, so the room list takes the place of the mode buttons
            var joining = modeBar.Selected == 2;
            // The player list and the map card take the place of the buttons below the mode bar
            var replaced = playersShown || cardShown;
            var browsing = joining && !replaced;
            foreach (var mode in modes) mode.Visible = !joining && !replaced;
            foreach (var control in new Control[] { roomsTitle, roomsCount, refresh, roomList, privatePrompt, codeBox, joinButton }) control.Visible = browsing;
            players.Visible = playersShown;
            mapCard.Visible = cardShown && !playersShown;
            players.SetBounds(P(20), P(y), P(440), P(168));
            mapCard.SetBounds(P(20), P(y), P(440), P(118));
            for (var i = 0; i < modes.Length; i++) modes[i].SetBounds(P(20 + i * 150), P(y), P(140), P(84));
            var titleWidth = TextRenderer.MeasureText(roomsTitle.Text, roomsTitle.Font).Width + P(4);
            roomsTitle.SetBounds(P(20), P(y), titleWidth, P(28));
            var refreshWidth = Math.Max(P(64), TextRenderer.MeasureText(refresh.Text, refresh.Font).Width + P(24));
            refresh.SetBounds(P(460) - refreshWidth, P(y), refreshWidth, P(28));
            roomsCount.SetBounds(P(20) + titleWidth + P(4), P(y), refresh.Left - (P(20) + titleWidth + P(12)), P(28));
            roomList.SetBounds(P(20), P(y + 34), P(440), P(ListHeight));
            var below = y + 34 + ListHeight + 10;
            privatePrompt.SetBounds(P(20), P(below), P(440), P(20));
            codeBox.SetBounds(P(20), P(below + 22), P(350), P(36));
            joinButton.SetBounds(P(378), P(below + 22), P(82), P(36));
            y += playersShown ? 180 : (cardShown ? 130 : (browsing ? 34 + ListHeight + 10 + 22 + 36 + 12 : 96));
            pauseBar.Visible = playersShown && paused;
            if (pauseBar.Visible)
            {
                pauseBar.SetBounds(P(20), P(y), P(440), P(44));
                y += 52;
            }
            // Notices share the status area below the buttons so the window never shifts
            notice.SetBounds(P(20), P(y), P(440), P(52));
            // Takes the idle status line on the host tab, so the host learns before starting that the game waits in Dota
            hostGuide.Visible = modeBar.Selected == 1 && !busy && !cardShown && !notice.Visible;
            hostGuide.SetBounds(P(20), P(y), P(440), P(52));
            status.Visible = !notice.Visible && !hostGuide.Visible;
            status.SetBounds(P(20), P(y), P(440), P(20));
            var actionWidth = Math.Max(P(80), TextRenderer.MeasureText(action.Text, action.Font).Width + P(28));
            var secondaryWidth = Math.Max(P(80), TextRenderer.MeasureText(secondary.Text, secondary.Font).Width + P(28));
            if (hostCode.Visible)
            {
                // A notice about the finished game is taller than the status line it replaces
                var row = notice.Visible ? y + 34 : y;
                hostCode.SetBounds(P(20), P(row + 24), P(150), P(36));
                secondary.SetBounds(P(178), P(row + 24), secondaryWidth, P(36));
                action.SetBounds(P(460) - actionWidth, P(row + 24), actionWidth, P(36));
                // The hosting hint runs to two lines in every language
                hint.SetBounds(P(20), P(row + 66), P(440), P(38));
                y = row;
            }
            else
            {
                marquee.SetBounds(P(20), P(y + 26), P(440), P(4));
                hint.SetBounds(P(20), P(y + 36), P(440), P(20));
                action.SetBounds(P(20), P(y + 62), actionWidth, P(30));
                secondary.SetBounds(P(20) + actionWidth + P(8), P(y + 62), secondaryWidth, P(30));
            }
            // An idle join page only ever shows a notice in this area, so it needs less room than a launch in progress
            y += browsing && !busy ? 60 : 124;
            divider.SetBounds(0, P(y), P(480), Math.Max(1, P(1)));
            mapDot.SetBounds(P(20), P(y + 16), P(8), P(8));
            var devWidth = TextRenderer.MeasureText(devLink.Text, devLink.Font).Width + P(4);
            devLink.SetBounds(P(460) - devWidth, P(y + 9), devWidth, P(22));
            var testWidth = testBox.PreferredWidth + P(2);
            feedbackLink.SetBounds(P(460) - devWidth - P(12) - feedbackLink.PreferredWidth, P(y + 8), feedbackLink.PreferredWidth, P(24));
            testBox.SetBounds(feedbackLink.Left - P(12) - testWidth, P(y + 9), testWidth, P(22));
            // The map status gives way to the buttons on the right in the longer languages
            var rightEdge = testBox.Visible ? testBox.Left : feedbackLink.Left;
            mapLabel.SetBounds(P(34), P(y + 9), Math.Min(P(200), rightEdge - P(34) - P(8)), P(22));
            ClientSize = new Size(P(480), P(y + 40));
        }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            Theme.UseDarkTitleBar(Handle);
            var round = new System.Drawing.Drawing2D.GraphicsPath();
            round.AddEllipse(0, 0, P(8), P(8));
            mapDot.Region = new Region(round);
            Relayout();
        }

        string MapId
        {
            get { return testBox.Checked ? TestId : ReleaseId; }
        }

        MapState RefreshMapState()
        {
            DotaInstall install;
            var id = MapId;
            var state = DotaInstall.Check(id, out install);
            switch (state)
            {
                case MapState.Ready:
                    SetFooter(Theme.Ok, Strings.MapReady);
                    ShowIdleNotice();
                    break;
                case MapState.Checking:
                    SetFooter(Theme.Faint, Strings.MapChecking);
                    ShowIdleNotice();
                    break;
                case MapState.Unverified:
                    SetFooter(Theme.Warning, Strings.MapUnverified);
                    ShowIdleNotice();
                    break;
                case MapState.Outdated:
                    SetFooter(Theme.Warning, Strings.MapOutdated);
                    if (modeBar.Selected == 0) ShowNotice(NoticeKind.Warning, Strings.OutdatedNotice, Strings.OpenWorkshop, () => OpenUrl("steam://url/CommunityFilePage/" + id));
                    else ShowIdleNotice();
                    break;
                case MapState.Missing:
                    SetFooter(Theme.Error, Strings.MapMissing);
                    ShowNotice(NoticeKind.Error, Strings.NoMap, Strings.Subscribe, () => OpenUrl("steam://url/CommunityFilePage/" + id));
                    break;
                case MapState.NoDota:
                    SetFooter(Theme.Error, Strings.MapUnknown);
                    ShowNotice(NoticeKind.Error, Strings.NoDota, false);
                    break;
                default:
                    SetFooter(Theme.Error, Strings.MapUnknown);
                    ShowNotice(NoticeKind.Error, Strings.NoSteam, false);
                    break;
            }
            UpdateMapCard(state);
            return state;
        }

        // Online play needs the latest map, so its tabs show why they cannot start as soon as they open
        void UpdateMapCard(MapState state)
        {
            var show = !busy && modeBar.Selected != 0 && state == MapState.Outdated;
            if (show) mapCard.Show(Strings.MapCardTitle, modeBar.Selected == 1 ? Strings.MapCardHost : Strings.MapCardJoin, Strings.OpenWorkshop);
            if (show == cardShown) return;
            cardShown = show;
            if (!busy) status.Text = IdleText();
            Relayout();
            UpdateBrowsing();
        }

        void RefreshPlayers()
        {
            var host = hostRoster;
            var join = joinTunnel;
            var symmetric = host != null ? hostSymmetric : joinSymmetric;
            var warning = symmetric == true ? Strings.SymmetricNat : null;
            players.MaxPlayers = host != null ? Settings.MaxPlayers : 0;
            if (host != null) players.SetPlayers(host.Snapshot(), selfId, warning);
            else if (join != null) players.SetPlayers(join.Roster(), selfId, join.Silent ? Strings.HostSilent : warning);
        }

        // The list lives only while the join page is idle and visible, so each visit measures every room once
        void UpdateBrowsing()
        {
            var wanted = !busy && modeBar.Selected == 2 && !cardShown;
            if (wanted && browser == null)
            {
                var created = new RoomBrowser(ListBody, (candidates, symmetric) => PeerBody(candidates, symmetric, InstalledMapVersion()));
                browser = created;
                created.Changed += () => UI(() => { if (browser == created) UpdateRoomList(); });
                roomList.SetRooms(new List<RoomRow>(), RoomList.ListState.Loading, null);
                roomsCount.Text = "";
                browseSince = DateTime.UtcNow;
                created.Start();
                created.Refresh();
                listTimer.Start();
            }
            else if (!wanted && browser != null && !busy)
            {
                browser.Dispose();
                browser = null;
                listTimer.Stop();
            }
        }

        void UpdateRoomList()
        {
            var source = browser;
            if (source == null) return;
            var rows = source.Snapshot();
            var state = rows.Count > 0 || source.Loaded ? RoomList.ListState.Ready : (source.LoadFailed ? RoomList.ListState.Failed : RoomList.ListState.Loading);
            string warning = null;
            if (source.SymmetricNat == true) warning = Strings.SymmetricNat;
            roomList.SetRooms(rows, state, warning);
            roomsCount.Text = source.Loaded
                ? (source.ActiveGames > 0 ? string.Format(Strings.ActiveGames, source.ActiveGames, source.ActivePlayers) : string.Format(Strings.RoomCount, rows.Count))
                : "";
        }

        Dictionary<string, object> ListBody()
        {
            return new Dictionary<string, object>
            {
                { "steamId", Net.SteamAccountId() },
                { "protocolVersion", RoomApi.ProtocolVersion },
                { "mapVersion", InstalledMapVersion() },
            };
        }

        string InstalledMapVersion()
        {
            DotaInstall install;
            var id = MapId;
            DotaInstall.Check(id, out install);
            return install == null ? null : install.InstalledManifest(id);
        }

        void UpdateJoinButton()
        {
            var ready = !busy && codeBox.Code.Length == 6;
            joinButton.Enabled = ready;
            joinButton.BackColor = ready ? Theme.Accent : Theme.PanelHover;
            joinButton.BorderColor = ready ? Theme.Accent : Theme.PanelHover;
            joinButton.ForeColor = ready ? Color.White : Theme.Faint;
        }

        void UpdateMaxButton()
        {
            maxButton.Text = string.Format(Strings.PlayersOption, Settings.MaxPlayers) + "  ▾";
            if (maxButton.Visible) Relayout();
        }

        // A limit below the players already in the room cannot be picked
        void ShowMaxMenu()
        {
            var roster = hostRoster;
            var inRoom = roster == null ? 0 : roster.ActiveCount();
            foreach (ToolStripMenuItem item in maxMenu.Items)
            {
                var value = (int)item.Tag;
                item.Checked = value == Settings.MaxPlayers;
                item.Enabled = value >= inRoom;
            }
            maxMenu.Show(maxButton, new Point(0, maxButton.Height));
        }

        void UpdateHostingHint()
        {
            if (hostingReady) hint.Text = Settings.PublicRoom ? Strings.PublicHostingHint : Strings.PrivateHostingHint;
        }

        void KickPlayer(string key)
        {
            var roster = hostRoster;
            var tunnel = hostTunnel;
            if (roster == null || tunnel == null) return;
            var entry = roster.Find(key);
            if (entry != null && entry.SteamId != 0)
            {
                lock (kicked) kicked.Add(entry.SteamId);
            }
            tunnel.Kick(key);
            roster.Remove(key);
            RefreshPlayers();
        }

        void ShowPause(bool show)
        {
            paused = show;
            if (show) pauseBar.Show(NoticeKind.Warning, Strings.RoomClosed, Strings.Reopen);
            else pauseBar.Visible = false;
            Relayout();
        }

        void ResumeRoom()
        {
            if (!busy || !paused || hostTunnel == null) return;
            ShowPause(false);
            StartPolling();
        }

        void StartPolling()
        {
            new Thread(PollRoom) { IsBackground = true }.Start();
        }

        void ShowPlayers(bool show)
        {
            playersShown = show;
            if (show)
            {
                RefreshPlayers();
                rosterTimer.Start();
            }
            else rosterTimer.Stop();
            Relayout();
        }

        static string Field(Dictionary<string, object> data, string key)
        {
            object value;
            return data.TryGetValue(key, out value) ? value as string : null;
        }

        void SetFooter(Color dot, string text)
        {
            mapDot.BackColor = dot;
            mapLabel.Text = text;
        }

        void ShowNotice(NoticeKind kind, string text, bool withLog)
        {
            if (withLog) ShowNotice(kind, text, Strings.ReportProblem, () => OpenFeedback(failure));
            else ShowNotice(kind, text, null, null);
            stickyNotice = withLog;
        }

        void ShowNotice(NoticeKind kind, string text, string button, Action onClick)
        {
            noticeAction = onClick;
            stickyNotice = false;
            var wasVisible = notice.Visible;
            notice.Show(kind, text, button);
            if (!wasVisible) Relayout();
        }

        // Map problems keep the notice area; otherwise it offers a pending update
        void ShowIdleNotice()
        {
            if (update == null) HideNotice();
            else ShowNotice(NoticeKind.Warning, string.Format(Strings.UpdateAvailable, update.Version), Strings.Update, StartUpdate);
        }

        void StartUpdate()
        {
            if (busy) return;
            busy = true;
            var release = update;
            ShowNotice(NoticeKind.Warning, Strings.Updating, null, null);
            new Thread(() =>
            {
                var exe = Updater.Download(release);
                if (exe != null && Updater.Install(exe))
                {
                    UI(Close);
                    return;
                }
                UI(() =>
                {
                    busy = false;
                    ShowNotice(NoticeKind.Error, Strings.UpdateFailed, Strings.OpenDownloadPage, () => OpenUrl(Updater.DownloadPage));
                    stickyNotice = true;
                });
            }) { IsBackground = true }.Start();
        }

        void HideNotice()
        {
            if (!notice.Visible) return;
            notice.Visible = false;
            Relayout();
        }

        void OnModeClick(int index)
        {
            if (busy) return;
            var state = RefreshMapState();
            // An outdated map only warns, so an unfinished or failed version check does not block starting either
            if (state == MapState.NoSteam || state == MapState.NoDota || state == MapState.Missing) return;
            // Friends must run the same map version, and Steam rewriting the map mid-load stalls the server
            if (modeBar.Selected == 1 && state == MapState.Outdated) return;

            if (DotaProcesses().Count > 0 &&
                !ConfirmDialog.Ask(this, Strings.DotaRunningTitle, Strings.DotaRunningBody, Strings.CloseAndStart))
            {
                return;
            }

            DotaInstall install;
            DotaInstall.Check(MapId, out install);
            var id = MapId;
            var map = MapKeys[index];
            var room = modeBar.Selected == 1;
            roomMap = MapNames[index];
            selfId = Net.SteamAccountId();
            busy = true;
            stopping = false;
            for (var i = 0; i < modes.Length; i++)
            {
                modes[i].Active = i == index;
                modes[i].ActiveSub = Strings.StartingSub;
                modes[i].Dimmed = i != index;
                modes[i].Invalidate();
            }
            SetIdleControlsEnabled(false);
            ShowProgress(Strings.Starting, room ? Strings.RoomStartingHint : Strings.StartingHint, Strings.Cancel, true);
            stage = room ? "host" : "solo";
            new Thread(() => Run(install, id, map, room)) { IsBackground = true }.Start();
        }

        void Run(DotaInstall install, string id, string map, bool room)
        {
            try
            {
                var running = DotaProcesses();
                if (running.Count > 0)
                {
                    UI(() => status.Text = Strings.ClosingDota);
                    foreach (var p in running) KillQuietly(p);
                    foreach (var p in running) WaitQuietly(p);
                    if (DotaProcesses().Count > 0) throw new LaunchError(Strings.DotaNotClosed, false);
                    UI(() => status.Text = Strings.Starting);
                }

                if (stopping) throw new OperationCanceledException();
                var manifest = install.InstalledManifest(id);
                id = PrepareAddon(install, id);

                string code = null, token = null;
                Dictionary<string, object> hostBody = null;
                if (room)
                {
                    UI(() => status.Text = Strings.OpeningRoom);
                    hostTunnel = new HostTunnel();
                    bool publicIp;
                    var candidates = hostTunnel.Gather(out publicIp);
                    hostBody = PeerBody(candidates, hostTunnel.SymmetricNat, manifest);
                    hostBody["publicIp"] = publicIp;
                    hostSymmetric = hostTunnel.SymmetricNat;
                    lock (seenJoins) seenJoins.Clear();
                    lock (kicked) kicked.Clear();
                    Dictionary<string, object> opened;
                    try
                    {
                        var openBody = new Dictionary<string, object>(hostBody);
                        AddRoomState(openBody, 1);
                        opened = RoomApi.Host(openBody);
                        code = (string)opened["code"];
                        token = (string)opened["token"];
                    }
                    catch (RoomError)
                    {
                        throw new LaunchError(Strings.OpenRoomFailed, false);
                    }
                    var roster = new HostRoster();
                    roster.Add(new RosterEntry { SteamId = selfId, Key = "host", Name = Field(opened, "personaName"), AvatarUrl = Field(opened, "avatarUrl"), Status = PlayerStatus.Loading, IsHost = true });
                    hostRoster = roster;
                    hostTunnel.RosterSource = roster.Snapshot;
                    hostTunnel.JoinFinished += OnJoinFinished;
                    hostTunnel.JoinLeft += joinId => roster.SetStatus(joinId, PlayerStatus.Left);
                    hostTunnel.Start();
                    rosterServer = new RosterServer(roster.Snapshot, () => Settings.MaxPlayers);
                    rosterServer.Start();
                    // The code is ready long before the server, so the host can share it while waiting
                    var shown = code;
                    UI(() =>
                    {
                        hostCode.Code = shown;
                        hostCode.Visible = true;
                        players.CanKick = true;
                        ShowPlayers(true);
                        ShowProgress(Strings.RoomCode, "", Strings.Cancel, false);
                        ApplyRoomType();
                    });
                }

                logFile = Path.Combine(install.Game, @"dota\dedicated.log");
                if (File.Exists(logFile)) File.Delete(logFile);

                server = StartDota(new ProcessStartInfo
                {
                    FileName = install.Exe,
                    WorkingDirectory = install.Game,
                    Arguments = "-dedicated -console -allow_no_lobby_connect -ip 127.0.0.1 -port " + Port +
                        " -con_logfile dedicated.log +sv_hibernate_when_empty 0 +dota_quit_after_game 0" +
                        (room ? " +hostname " + RoomHostname : "") +
                        " \"+map " + map + " gamemode=15 customgamemode=" + id + " nomapvalidation=1\"",
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden,
                });

                // The code is shown as soon as the room opens, so friends may join while the server is still loading
                if (code != null)
                {
                    roomCode = code;
                    roomToken = token;
                    roomBody = hostBody;
                    StartPolling();
                }

                WaitForMap(map);
                UI(() => hint.Text = Strings.OpeningDota);

                StartClient(install);

                UI(() =>
                {
                    foreach (var mode in modes)
                    {
                        mode.ActiveSub = Strings.InGame;
                        mode.Invalidate();
                    }
                    if (code == null)
                    {
                        ShowProgress(Strings.InGame, Strings.InGameHint, Strings.StopServer, false);
                        return;
                    }
                    hostingReady = true;
                    UpdateHostingHint();
                    action.Text = Strings.StopServer;
                    Relayout();
                });
                if (code == null) WatchSolo();
                else WatchRoom(install);
            }
            catch (LaunchError error)
            {
                failureCause = error;
                Finish(error.Message, error.ShowLog, error.Button, error.OnClick);
            }
            catch (Exception error)
            {
                failureCause = error;
                Finish(Strings.LaunchFailed + error.Message, logFile != null);
            }
        }

        static void LinkAddon(string addonDir, string vpk)
        {
            // The engine only mounts addons from game\dota_addons; relinking every run picks up Workshop updates
            Directory.CreateDirectory(addonDir);
            var target = Path.Combine(addonDir, "pak01_dir.vpk");
            if (File.Exists(target)) File.Delete(target);
            if (!NativeMethods.CreateHardLink(target, vpk, IntPtr.Zero)) File.Copy(vpk, target);
        }

        void WaitForMap(string map)
        {
            var ready = "Host activate: Loading (" + map + ")";
            var started = DateTime.Now;
            while (true)
            {
                if (stopping) throw new OperationCanceledException();
                if (server.HasExited) throw new LaunchError(Strings.ServerExited, true);
                NativeMethods.HideWindowsOf(server.Id);
                if (ReadShared(logFile).Contains(ready))
                {
                    NativeMethods.HideWindowsOf(server.Id);
                    return;
                }
                var waited = (DateTime.Now - started).TotalSeconds;
                if (waited > TimeoutSeconds) throw new LaunchError(Strings.Timeout, true);
                var text = string.Format(waited > SlowSeconds ? Strings.ServerSlow : Strings.ServerStarting, (int)waited);
                UI(() => hint.Text = text);
                Thread.Sleep(1000);
            }
        }

        void OnJoinClick(string code)
        {
            if (busy) return;
            if (code.Length != 6)
            {
                ShowNotice(NoticeKind.Error, Strings.InvalidCode, false);
                return;
            }
            var state = RefreshMapState();
            // Mismatched map versions between host and joiner can break the game, so an outdated map blocks joining
            if (state == MapState.NoSteam || state == MapState.NoDota || state == MapState.Missing || state == MapState.Outdated) return;
            if (DotaProcesses().Count > 0 &&
                !ConfirmDialog.Ask(this, Strings.DotaRunningTitle, Strings.DotaRunningBody, Strings.CloseAndStart))
            {
                return;
            }

            DotaInstall install;
            DotaInstall.Check(MapId, out install);
            var id = MapId;
            selfId = Net.SteamAccountId();
            busy = true;
            stopping = false;
            foreach (var mode in modes)
            {
                mode.Dimmed = true;
                mode.Invalidate();
            }
            // The join takes over the socket the list probed with, so the browser is not closed with the page
            var source = browser;
            browser = null;
            listTimer.Stop();
            SetIdleControlsEnabled(false);
            ShowProgress(Strings.Connecting, Strings.ConnectingHint, Strings.Cancel, true);
            stage = "join";
            new Thread(() => RunJoin(install, id, code, source)) { IsBackground = true }.Start();
        }

        void RunJoin(DotaInstall install, string id, string code, RoomBrowser source)
        {
            try
            {
                JoinTunnel tunnel = null;
                List<Candidate> candidates = null;
                if (source != null)
                {
                    tunnel = source.TakeTunnel(out candidates);
                    source.Dispose();
                }
                if (tunnel == null)
                {
                    tunnel = new JoinTunnel();
                    joinTunnel = tunnel;
                    bool publicIp;
                    candidates = tunnel.Gather(out publicIp);
                    tunnel.Start();
                }
                joinTunnel = tunnel;
                joinSymmetric = tunnel.SymmetricNat;
                if (stopping) throw new OperationCanceledException();
                Dictionary<string, object> joined;
                try
                {
                    joined = RoomApi.Join(code, PeerBody(candidates, tunnel.SymmetricNat, install.InstalledManifest(id)));
                }
                catch (RoomError error)
                {
                    var failure = new LaunchError(JoinErrorText(error.Code, install, id), false);
                    if (error.Code == "kicked" || error.Code == "room_full")
                    {
                        failure.Button = Strings.BackToList;
                        failure.OnClick = BackToList;
                    }
                    throw failure;
                }
                var hostProfile = joined["host"] as Dictionary<string, object> ?? new Dictionary<string, object>();
                var selfProfile = joined["self"] as Dictionary<string, object> ?? new Dictionary<string, object>();
                tunnel.Placeholder = new List<RosterEntry>
                {
                    new RosterEntry { Name = Field(hostProfile, "personaName"), AvatarUrl = Field(hostProfile, "avatarUrl"), Status = PlayerStatus.Connecting, IsHost = true },
                    new RosterEntry { SteamId = selfId, Name = Field(selfProfile, "personaName"), AvatarUrl = Field(selfProfile, "avatarUrl"), Status = PlayerStatus.Connecting },
                };
                UI(() => ShowPlayers(true));
                var hostCandidates = new List<Candidate>();
                foreach (var text in (object[])joined["hostCandidates"]) hostCandidates.Add(Candidate.Parse((string)text));
                var path = tunnel.Connect((string)joined["joinToken"], hostCandidates);
                if (stopping) throw new OperationCanceledException();
                if (tunnel.Kicked) throw new LaunchError(Strings.KickedByHost, false);
                if (path == null) throw new LaunchError(Strings.ConnectFailed, false);

                var running = DotaProcesses();
                foreach (var p in running) KillQuietly(p);
                foreach (var p in running) WaitQuietly(p);
                if (DotaProcesses().Count > 0) throw new LaunchError(Strings.DotaNotClosed, false);
                PrepareAddon(install, id);
                tunnel.Forward();
                StartClient(install);

                UI(() => ShowProgress(string.Format(Strings.Joined, code), Strings.JoinedHint, Strings.LeaveRoom, false));
                WatchJoin(tunnel, install);
            }
            catch (LaunchError error)
            {
                failureCause = error;
                Finish(error.Message, error.ShowLog, error.Button, error.OnClick);
            }
            catch (Exception error)
            {
                failureCause = error;
                Finish(Strings.LaunchFailed + error.Message, false);
            }
        }

        // The tunnel outlives Dota, so a joiner whose game closed can go back into the same match
        void WatchJoin(JoinTunnel tunnel, DotaInstall install)
        {
            bool? wasRunning = null;
            var ended = false;
            while (!stopping)
            {
                Thread.Sleep(2000);
                if (tunnel.Kicked) throw new LaunchError(Strings.KickedByHost, false);
                var running = DotaProcesses().Count > 0;
                // Nothing is left to rejoin after the game, so leaving the room is the only next step
                if (tunnel.GameEnded)
                {
                    endNotice = Strings.GameEnded;
                    if (!running || tunnel.Lost) break;
                    if (ended) continue;
                    ended = true;
                    UI(() =>
                    {
                        if (!busy) return;
                        secondary.Visible = false;
                        hint.Visible = false;
                        ShowNotice(NoticeKind.Success, Strings.GameEndedLeave, null, null);
                    });
                    continue;
                }
                if (tunnel.Lost) throw new LaunchError(Strings.HostLost, false);
                if (running == wasRunning) continue;
                wasRunning = running;
                UI(() =>
                {
                    if (running) secondary.Visible = false;
                    else ShowSecondary(Strings.Rejoin, () => StartClient(install));
                });
            }
            Finish(null, false);
        }

        // The API answers the same room again once the host polls with its token, even after the room lapsed while paused
        void PollRoom()
        {
            var since = DateTime.UtcNow;
            var started = false;
            while (!stopping)
            {
                var elapsed = DateTime.UtcNow - since;
                if (!started && elapsed >= PauseAfter())
                {
                    HideFromList();
                    UI(() => { if (busy && hostTunnel != null) ShowPause(true); });
                    return;
                }
                Thread.Sleep(started ? GamePollMs : (elapsed.TotalMinutes < FastPollMinutes ? FastPollMs : SlowPollMs));
                var tunnel = hostTunnel;
                var roster = hostRoster;
                if (tunnel == null || roster == null || stopping) return;
                var startedNow = started || ReadShared(logFile).Contains(HeroSelection);
                var body = new Dictionary<string, object>(roomBody);
                body["code"] = roomCode;
                body["token"] = roomToken;
                body["started"] = startedNow;
                AddRoomState(body, roster.ActiveCount());
                List<Dictionary<string, object>> results;
                lock (joinResults)
                {
                    results = new List<Dictionary<string, object>>(joinResults);
                    joinResults.Clear();
                }
                body["results"] = results;
                try
                {
                    var answer = RoomApi.Host(body);
                    started = startedNow;
                    foreach (Dictionary<string, object> join in (object[])answer["joins"])
                    {
                        var joinId = (string)join["joinId"];
                        lock (seenJoins)
                        {
                            if (!seenJoins.Add(joinId)) continue;
                        }
                        var steamId = join.ContainsKey("steamId") && join["steamId"] != null ? Convert.ToInt64(join["steamId"]) : 0;
                        object probeValue;
                        // A probe only measures latency for someone browsing the list, so it never shows as a player
                        var probe = join.TryGetValue("probe", out probeValue) && true.Equals(probeValue);
                        if (!probe)
                        {
                            lock (kicked)
                            {
                                if (kicked.Contains(steamId)) continue;
                            }
                            roster.Add(new RosterEntry { SteamId = steamId, Key = joinId, Name = Field(join, "personaName"), AvatarUrl = Field(join, "avatarUrl"), Status = PlayerStatus.Connecting });
                        }
                        var candidates = new List<Candidate>();
                        foreach (var text in (object[])join["candidates"]) candidates.Add(Candidate.Parse((string)text));
                        tunnel.AddJoin(joinId, (string)join["joinToken"], candidates, probe);
                    }
                }
                catch (Exception)
                {
                    // Polling resumes on the next tick; the start notice and results are sent again then
                    lock (joinResults) joinResults.AddRange(results);
                }
            }
        }

        // Without it a closed room stays listed until the API sees the polls stop, and browsers would find it unreachable
        void HideFromList()
        {
            var roster = hostRoster;
            // Without a code the request would open a new room instead
            if (roster == null || roomCode == null || roomBody == null) return;
            var body = new Dictionary<string, object>(roomBody);
            body["code"] = roomCode;
            body["token"] = roomToken;
            AddRoomState(body, roster.ActiveCount());
            body["public"] = false;
            try
            {
                RoomApi.Host(body);
            }
            catch (Exception)
            {
                // The room still drops out once the API sees the polls stop
            }
        }

        // Sent with the opening request and every poll, so changes the host makes while the room is open reach the list
        void AddRoomState(Dictionary<string, object> body, int playerCount)
        {
            body["public"] = Settings.PublicRoom;
            body["maxPlayers"] = Settings.MaxPlayers;
            body["map"] = roomMap;
            body["playerCount"] = playerCount;
            lock (kicked) body["kickedSteamIds"] = kicked.ToArray();
        }

        // WINDY_ROOM_PAUSE_SECONDS shortens the pause so testers need not wait a quarter of an hour
        static TimeSpan PauseAfter()
        {
            int seconds;
            var text = Environment.GetEnvironmentVariable("WINDY_ROOM_PAUSE_SECONDS");
            return int.TryParse(text, out seconds) && seconds > 0 ? TimeSpan.FromSeconds(seconds) : TimeSpan.FromMinutes(PauseMinutes);
        }

        void BackToList()
        {
            HideNotice();
            if (browser != null) browser.Refresh();
        }

        void OnJoinFinished(string joinId, string path, int elapsedMs)
        {
            var result = new Dictionary<string, object> { { "joinId", joinId }, { "elapsedMs", elapsedMs } };
            if (path != null) result["path"] = path;
            lock (joinResults) joinResults.Add(result);
            var roster = hostRoster;
            if (roster != null) roster.SetStatus(joinId, path != null ? PlayerStatus.Loading : PlayerStatus.Failed);
        }

        Dictionary<string, object> PeerBody(List<Candidate> candidates, bool? symmetricNat, string mapVersion)
        {
            return new Dictionary<string, object>
            {
                { "mapVersion", mapVersion },
                { "steamId", Net.SteamAccountId() },
                { "candidates", candidates.ConvertAll(c => c.ToString()) },
                // A required API field; this launcher never maps a router port
                { "upnp", false },
                { "symmetricNat", symmetricNat },
                { "protocolVersion", RoomApi.ProtocolVersion },
                { "launcherVersion", Version },
            };
        }

        static string JoinErrorText(string code, DotaInstall install, string id)
        {
            switch (code)
            {
                // A joiner with the latest map knows the host is the one behind
                case "map_mismatch":
                    DotaInstall checkedInstall;
                    return DotaInstall.Check(id, out checkedInstall) == MapState.Ready ? Strings.MapHostOld : Strings.MapMismatch;
                case "room_not_found": return Strings.RoomNotFound;
                case "game_started": return Strings.GameStarted;
                case "version_mismatch": return Strings.VersionMismatch;
                case "kicked": return Strings.KickedJoin;
                case "room_full": return Strings.RoomFull;
                case "network": return Strings.RoomNetwork;
                default: return Strings.LaunchFailed + code;
            }
        }

        // Lets a developer test against the map built from the game repo rather than the Workshop copy
        static string PrepareAddon(DotaInstall install, string id)
        {
            var local = Environment.GetEnvironmentVariable("WINDY_ADDON");
            if (!string.IsNullOrEmpty(local)) return local;
            LinkAddon(Path.Combine(install.Game, @"dota_addons\" + id), install.Vpk(id));
            return id;
        }

        // A client started outside Steam fails VAC verification when it later joins an Arcade lobby;
        // -applaunch goes through Steam without the confirmation dialog that steam://run shows
        static void StartClient(DotaInstall install)
        {
            var steam = DotaInstall.SteamExecutable();
            if (steam == null) throw new LaunchError(Strings.SteamClientMissing, false);
            // A leftover log from the last game would be mistaken for this one's
            try
            {
                var clientLog = Path.Combine(install.Game, @"dota\client.log");
                if (File.Exists(clientLog)) File.Delete(clientLog);
            }
            catch (Exception)
            {
            }
            StartDota(new ProcessStartInfo
            {
                FileName = steam,
                Arguments = "-applaunch 570 -novid -con_logfile client.log +connect 127.0.0.1:" + Port,
                UseShellExecute = false,
            });
        }

        string IdleText()
        {
            if (cardShown) return "";
            if (modeBar.Selected == 1) return Strings.HostIdle;
            return modeBar.Selected == 2 ? "" : Strings.Idle;
        }

        void ShowSecondary(string text, Action onClick)
        {
            secondary.Text = text;
            secondaryAction = onClick;
            secondary.Visible = true;
            Relayout();
        }

        void SetIdleControlsEnabled(bool enabled)
        {
            foreach (var control in new Control[] { testBox, modeBar, codeBox, roomList, refresh })
            {
                control.Enabled = enabled;
                control.Invalidate();
            }
            UpdateJoinButton();
        }

        void CloseTunnels()
        {
            var h = hostTunnel;
            hostTunnel = null;
            if (h != null) h.Dispose();
            var r = rosterServer;
            rosterServer = null;
            if (r != null) r.Dispose();
            var j = joinTunnel;
            joinTunnel = null;
            if (j != null) j.Dispose();
        }

        void WatchSolo()
        {
            var seen = false;
            var serverId = server.Id;
            while (!stopping)
            {
                Thread.Sleep(3000);
                if (server.HasExited) throw new LaunchError(Strings.ServerExited, true);
                NativeMethods.HideWindowsOf(serverId);
                var clients = DotaProcesses().FindAll(p => p.Id != serverId).Count;
                if (clients > 0) seen = true;
                else if (seen) break;
            }
            Finish(null, false);
        }

        // Friends are still playing on this server, so closing the host's own Dota never stops it; only the host
        // does, or the room itself once the results are saved and everyone has left
        void WatchRoom(DotaInstall install)
        {
            var serverId = server.Id;
            long logOffset = 0;
            bool? wasRunning = null;
            var seen = false;
            DateTime? endedAt = null;
            var saved = false;
            while (!stopping)
            {
                Thread.Sleep(3000);
                var text = ReadFrom(logFile, ref logOffset);
                var roster = hostRoster;
                var tunnel = hostTunnel;
                if (roster == null || tunnel == null) break;
                foreach (Match match in Regex.Matches(text, @"Adding player SteamID (\d+)"))
                {
                    roster.SetInGame(long.Parse(match.Groups[1].Value));
                }
                if (server.HasExited) throw new LaunchError(Strings.ServerExited, true);
                NativeMethods.HideWindowsOf(serverId);

                if (endedAt == null && (text.Contains(ResultsSent) || text.Contains(PostGame)))
                {
                    endedAt = DateTime.UtcNow;
                    tunnel.GameEnded = true;
                    UI(() => ShowRoomEnd(false));
                }
                if (endedAt != null && !saved &&
                    (text.Contains(ResultsDone) || (DateTime.UtcNow - endedAt.Value).TotalSeconds > ResultsFallbackSeconds))
                {
                    saved = true;
                    UI(() => ShowRoomEnd(true));
                }

                var clients = DotaProcesses().FindAll(p => p.Id != serverId).Count > 0;
                if (saved && !clients && roster.GuestCount() == 0) break;
                if (clients) seen = true;
                // Steam takes a few seconds to start Dota, which is not the host closing it
                var running = clients || !seen;
                if (running == wasRunning) continue;
                wasRunning = running;
                var ended = endedAt != null;
                UI(() => ShowHostClient(running, ended, install));
            }
            Finish(null, false);
        }

        void ShowHostClient(bool running, bool ended, DotaInstall install)
        {
            if (!busy || !hostCode.Visible) return;
            clientClosed = !running && !ended;
            if (clientClosed)
            {
                status.Text = Strings.ServerStillRunning;
                ShowSecondary(Strings.Rejoin, () => StartClient(install));
            }
            ApplyRoomType();
        }

        // Runs when the game ends and again once its results are saved
        void ShowRoomEnd(bool saved)
        {
            if (!busy || !hostCode.Visible) return;
            saving = !saved;
            endNotice = Strings.GameEnded;
            clientClosed = false;
            secondary.Visible = false;
            pauseBar.Visible = false;
            hint.Visible = false;
            ShowNotice(saved ? NoticeKind.Success : NoticeKind.Warning, saved ? Strings.ResultsSaved : Strings.SavingResults, null, null);
            if (saved) action.MakePrimary();
            Relayout();
        }

        // A public room is found in the list, so it does not ask the host to share the code
        void ApplyRoomType()
        {
            if (!hostCode.Visible) return;
            hostCode.Quiet = Settings.PublicRoom;
            if (endNotice == null && !clientClosed)
            {
                status.Text = Settings.PublicRoom ? "" : Strings.RoomCode;
                var code = hostCode.Code;
                if (Settings.PublicRoom) secondary.Visible = false;
                else ShowSecondary(Strings.Copy, () => Clipboard.SetText(code));
            }
            Relayout();
        }

        void StopServer()
        {
            stopping = true;
            var s = server;
            if (s != null) KillQuietly(s);
            // Ends a handshake that is still waiting for the host
            var j = joinTunnel;
            if (j != null) j.Dispose();
        }

        // Runs on the worker thread when a launch ends for any reason, and returns the window to its idle state
        void Finish(string error, bool showLog)
        {
            Finish(error, showLog, null, null);
        }

        void Finish(string error, bool showLog, string button, Action onClick)
        {
            var cancelled = stopping;
            if (error != null && !cancelled)
            {
                failure = new FeedbackError { Message = error, Stage = stage, Detail = failureCause == null ? null : failureCause.ToString() };
            }
            failureCause = null;
            // Stops the poll thread first so a late poll cannot list the room again
            stopping = true;
            HideFromList();
            var s = server;
            if (s != null) KillQuietly(s);
            server = null;
            CloseTunnels();
            hostRoster = null;
            UI(() =>
            {
                busy = false;
                foreach (var mode in modes)
                {
                    mode.Active = false;
                    mode.Dimmed = false;
                    mode.Invalidate();
                }
                SetIdleControlsEnabled(true);
                secondary.Visible = false;
                hostCode.Visible = false;
                hostingReady = false;
                clientClosed = false;
                saving = false;
                action.MakePlain();
                var ended = endNotice;
                endNotice = null;
                players.CanKick = false;
                hostSymmetric = joinSymmetric = null;
                paused = false;
                pauseBar.Visible = false;
                ShowPlayers(false);
                marquee.Visible = false;
                hint.Visible = false;
                action.Visible = false;
                status.Text = IdleText();
                status.ForeColor = Theme.Muted;
                UpdateBrowsing();
                if (error != null && !cancelled && button != null) ShowNotice(NoticeKind.Error, error, button, onClick);
                else if (error != null && !cancelled) ShowNotice(NoticeKind.Error, error, showLog && logFile != null && File.Exists(logFile));
                else if (ended != null)
                {
                    ShowNotice(NoticeKind.Success, ended, null, null);
                    // Kept until the next launch rather than cleared by the next map check
                    stickyNotice = true;
                }
                else RefreshMapState();
                Relayout();
            });
        }

        void ShowProgress(string title, string detail, string button, bool animate)
        {
            status.Text = title;
            status.ForeColor = Theme.Text;
            hint.Text = detail;
            hint.Visible = true;
            marquee.Visible = animate;
            action.Text = button;
            action.Visible = true;
            notice.Visible = false;
            Relayout();
        }

        void UI(Action work)
        {
            if (IsDisposed) return;
            try
            {
                BeginInvoke(work);
            }
            catch (InvalidOperationException)
            {
                // The window closed while a launch was still finishing
            }
        }

        internal static void OpenUrl(string url)
        {
            try
            {
                Process.Start(url);
            }
            catch (Exception)
            {
            }
        }

        // Opens the feedback dialog; a launch failure passes its details along without showing them
        void OpenFeedback(FeedbackError error)
        {
            DotaInstall install;
            DotaInstall.Check(MapId, out install);
            var context = new FeedbackContext
            {
                LauncherVersion = Version,
                MapVersion = InstalledMapVersion(),
                Mode = modeBar.Selected,
                GameDir = install == null ? null : install.Game,
                Error = error,
            };
            using (var dialog = new FeedbackDialog(context))
            {
                if (dialog.ShowDialog(this) == DialogResult.OK) ShowThanks();
            }
        }

        // Shares the idle status line, so it only appears when nothing else is using it
        void ShowThanks()
        {
            if (busy) return;
            if (notice.Visible && stickyNotice)
            {
                stickyNotice = false;
                HideNotice();
            }
            if (notice.Visible) return;
            status.Text = Strings.FeedbackThanks;
            status.ForeColor = Theme.Ok;
            thanksTimer.Stop();
            thanksTimer.Start();
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            var s = server;
            if (s != null && !s.HasExited)
            {
                if (!ConfirmDialog.Ask(this, Strings.QuitTitle, Strings.QuitBody, Strings.Close))
                {
                    e.Cancel = true;
                    return;
                }
                stopping = true;
                KillQuietly(s);
            }
            // Bounded so a slow network never holds the window open
            var hide = new Thread(HideFromList) { IsBackground = true };
            hide.Start();
            hide.Join(3000);
            CloseTunnels();
            if (browser != null) browser.Dispose();
            base.OnFormClosing(e);
        }

        static List<Process> DotaProcesses()
        {
            return new List<Process>(Process.GetProcessesByName("dota2"));
        }

        static void KillQuietly(Process process)
        {
            try
            {
                if (!process.HasExited) process.Kill();
            }
            catch (Exception)
            {
                // Already gone or not ours to kill; nothing else to do
            }
        }

        static void WaitQuietly(Process process)
        {
            try
            {
                process.WaitForExit(15000);
            }
            catch (Exception)
            {
                // Not ours to wait on; nothing else to do
            }
        }

        static Process StartDota(ProcessStartInfo info)
        {
            // Players often mark Steam or Dota as "Run as administrator"; neither needs it, and a non-elevated launcher cannot start them otherwise
            info.EnvironmentVariables["__COMPAT_LAYER"] = "RunAsInvoker";
            try
            {
                return Process.Start(info);
            }
            catch (Win32Exception error)
            {
                if (error.NativeErrorCode == ErrorAccessDenied) throw new LaunchError(Strings.DotaBlocked, false);
                if (error.NativeErrorCode == ErrorElevationRequired) throw new LaunchError(Strings.DotaNeedsAdmin, false);
                throw;
            }
        }

        // Reads only what the server appended since the last call; the log grows for the whole game
        static string ReadFrom(string path, ref long offset)
        {
            if (!File.Exists(path)) return "";
            using (var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
            {
                if (stream.Length < offset) offset = 0;
                stream.Seek(offset, SeekOrigin.Begin);
                using (var reader = new StreamReader(stream))
                {
                    var text = reader.ReadToEnd();
                    offset = stream.Length;
                    return text;
                }
            }
        }

        static string ReadShared(string path)
        {
            if (!File.Exists(path)) return "";
            // The server keeps the log open for writing
            using (var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
            using (var reader = new StreamReader(stream))
            {
                return reader.ReadToEnd();
            }
        }
    }

    static class NativeMethods
    {
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        public static extern bool CreateHardLink(string fileName, string existingFileName, IntPtr securityAttributes);

        delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr param);

        [DllImport("user32.dll")]
        static extern bool EnumWindows(EnumWindowsProc callback, IntPtr param);

        [DllImport("user32.dll")]
        static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);

        [DllImport("user32.dll")]
        static extern bool IsWindowVisible(IntPtr hwnd);

        [DllImport("user32.dll")]
        static extern bool ShowWindow(IntPtr hwnd, int command);

        // The dedicated server opens its own console window however it is started.
        // Hiding another process's window has tripped Defender before, so every release is scanned first (README)
        public static void HideWindowsOf(int pid)
        {
            EnumWindows((hwnd, param) =>
            {
                uint owner;
                GetWindowThreadProcessId(hwnd, out owner);
                if (owner == pid && IsWindowVisible(hwnd)) ShowWindow(hwnd, 0);
                return true;
            }, IntPtr.Zero);
        }
    }
}
