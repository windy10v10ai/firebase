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
[assembly: System.Reflection.AssemblyVersion(Windy10v10AI.Launcher.LauncherVersion.Current + ".0")]
[assembly: System.Reflection.AssemblyFileVersion(Windy10v10AI.Launcher.LauncherVersion.Current + ".0")]

namespace Windy10v10AI.Launcher
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            var args = Environment.GetCommandLineArgs();
            if (args.Length == 3 && args[1] == WorkshopDownload.Flag)
            {
                Environment.Exit(WorkshopDownload.RunChild(args[2]));
                return;
            }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            JoinTunnel.RelayOnly = Array.IndexOf(Environment.GetCommandLineArgs(), "--relay-only") > 0;
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
        const string Version = LauncherVersion.Current;
        const string ReleaseId = "2307479570";
        const string TestId = "2636824668";
        const int Port = 27015;
        // Dota keeps sending while it loads, so a longer silence means it left the game; a slow PC gets room to spare
        const int OutAfterMs = 30000;
        // Dota can take a while to exit after the player quits from inside the game
        const int ClosingGraceMs = 60000;
        // Steam hands a running Dota over within a second or two when it works at all
        const int SteamEnterMs = 5000;
        // The host sends its roster every two seconds
        const int JoinStateWaitMs = 5000;
        // Dota gives the room's privileges to whoever loads in first, so joiners wait for the host, but not on a host that hangs
        const int HostHeadStartMs = 30000;
        static readonly string ConnectCommand = "connect 127.0.0.1:" + LocalGate.Port;
        // Long enough for Steam to apply a pending update before signing in
        const int SteamSignInMs = 90000;
        const int SlowSeconds = 60;
        const int TimeoutSeconds = 180;
        const int ErrorAccessDenied = 5;
        const int ErrorElevationRequired = 740;
        // The game turns off its auto start when the dedicated server carries this name
        const string RoomHostname = "windy10v10ai-room";
        const string HeroSelection = "DOTA_GAMERULES_STATE_HERO_SELECTION";
        const string CorruptContent = "FATAL ERROR: Content file";
        const string LocalContentCorrupt = "Local content might be corrupt";
        // Most friends join within minutes of the room opening, so polling is fast then and slower after
        const int FastPollMs = 2000;
        const int SlowPollMs = 5000;
        const int GamePollMs = 60000;
        // Keeps BigQuery rows few, at the cost of losing up to this much when the host crashes
        const int QualityWindowMs = 300000;
        // Matches the API's cap, so rows piling up while the API is unreachable are dropped oldest first
        const int MaxPendingQuality = 50;
        const int RouteRefreshMs = 5000;
        // The same line the route check draws for the direct route, so a warning on the status line means the game will stutter
        const int RouteWarnLossPct = 5;
        const int FastPollMinutes = 5;
        // An idle room stops polling so it drops off the list; the host resumes it with one click if still there
        const int PauseMinutes = 15;
        const int ListRefreshMs = 60000;
        const int BadgeRefreshMs = 60000;
        // A join page left open in the background stops asking the API for the list
        const int BrowseMinutes = 5;
        // The API caches the list this long, so coming back to the window sooner than this asks for nothing new
        const int ActivateRefreshSeconds = 10;
        const int ListHeight = 280;
        const int BannerHeight = 80;

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
        // The joiner's route and how it is doing, on the right of the status line
        readonly Panel routeDot = new Panel();
        readonly Label routeLabel = new Label();
        bool routeShown;
        bool routeWasChecking;
        string joinedCode;
        Dictionary<string, object> lastConnection;
        DateTime routeRefreshed;
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
        readonly FlatButton refresh = new FlatButton();
        readonly RoomList roomList = new RoomList();
        readonly System.Windows.Forms.Timer listTimer = new System.Windows.Forms.Timer { Interval = ListRefreshMs };
        RoomBrowser browser;
        DateTime browseSince;
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
        // Replaced wholesale by the measuring thread, so readers never see a half-filled list
        volatile List<RelayLeg> hostRelays = new List<RelayLeg>();
        readonly HashSet<string> seenJoins = new HashSet<string>();
        readonly List<long> kicked = new List<long>();
        bool paused;
        bool hostingReady;
        // Read by the poll thread, so the list hides a finished game and shows how long the host's own has run
        volatile bool roomEnded;
        DateTime? roomStartedAt;
        readonly Dictionary<Control, bool> hiddenTabStops = new Dictionary<Control, bool>();
        readonly System.Windows.Forms.Timer badgeTimer = new System.Windows.Forms.Timer { Interval = BadgeRefreshMs };
        int badgeLoading;
        DateTime badgeAsked;
        readonly NoticeBar hostGuide = new NoticeBar();
        bool clientClosed;
        LocalGate gate;
        ClientWatch clientWatch;
        readonly ToggleBox autoStartBox = new ToggleBox();
        readonly ToggleBox autoEnterBox = new ToggleBox();
        // Set once the results are saved, so the mode buttons start the next game of the open room
        bool pickingNext;
        // The mode the host picked for the next game, taken by the room's watch thread
        volatile int nextMode = -1;
        volatile int roomGame = 1;
        bool joinEnded;
        bool saving;
        // Shown once the window is back to idle, so a finished game does not end on a blank screen
        string endNotice;

        readonly System.Windows.Forms.Timer mapPoll = new System.Windows.Forms.Timer { Interval = 5000 };
        Process server;
        Action noticeAction;
        // Launch failures stay on screen until the player acts; map checks may replace any other notice
        bool stickyNotice;
        bool mapUpdating;
        // After Steam's forced download leaves the map outdated, resubscribing in the Workshop is the last thing to try
        string mapUpdateFailed;
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
            using (var picture = Image.FromStream(stream))
            {
                banner.Image = ShortBanner(picture);
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
            // Hosts tend to start alone at once, so the wait for other players stands out from the grey hints
            hint.TextChanged += delegate { hint.ForeColor = hint.Text == Strings.PublicHostingHint || hint.Text == Strings.PrivateHostingHint ? Theme.Text : Theme.Muted; };
            routeLabel.ForeColor = Theme.Muted;
            routeLabel.Font = new Font(Theme.FontName, 9f);
            routeLabel.TextAlign = ContentAlignment.MiddleRight;
            routeDot.Visible = routeLabel.Visible = false;
            marquee.Visible = false;
            hint.Visible = false;
            action.Visible = false;
            action.Click += delegate
            {
                if (saving && !ConfirmDialog.Ask(this, Strings.SavingCloseTitle, Strings.SavingCloseBody, Strings.StopAnyway)) return;
                StopServer();
            };
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
            autoStartBox.Text = Strings.AutoStartDota;
            autoStartBox.Checked = Settings.AutoStartDota;
            autoStartBox.CheckedChanged += delegate
            {
                Settings.AutoStartDota = autoStartBox.Checked;
                Settings.Save();
                hostGuide.Show(NoticeKind.Success, HostGuideText(), null);
            };
            hostGuide.Show(NoticeKind.Success, HostGuideText(), null);
            autoEnterBox.Text = Strings.AutoEnter;
            autoEnterBox.Checked = Settings.AutoEnter;
            autoEnterBox.Visible = false;
            autoEnterBox.CheckedChanged += delegate
            {
                Settings.AutoEnter = autoEnterBox.Checked;
                Settings.Save();
            };
            modeBar.Items = new[] { Strings.Solo, Strings.HostRoom, Strings.JoinRoom };
            modeBar.Badge = 2;
            badgeTimer.Tick += delegate { RefreshBadge(); };
            modeBar.Selected = Settings.Mode;
            status.Text = IdleText();
            modeBar.SelectedChanged += delegate
            {
                // A host may look at the public list while its room is open; the saved tab stays the host's
                if (Hosting)
                {
                    Relayout();
                    UpdateBrowsing();
                    return;
                }
                if (busy) return;
                Settings.Mode = modeBar.Selected;
                Settings.Save();
                status.Text = IdleText();
                RefreshMapState();
                Relayout();
                UpdateBrowsing();
                if (modeBar.Selected == 2) codeBox.FillFromClipboard();
            };
            mapCard.Action.Click += delegate { UpdateOrOpenWorkshop(); };
            rosterTimer.Tick += delegate
            {
                RefreshPlayers();
                RefreshRoute(false);
                if (Hosting && browser != null) UpdateRoomList();
            };
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
            refresh.Text = Strings.Refresh;
            refresh.Click += delegate
            {
                browseSince = DateTime.UtcNow;
                if (browser == null) UpdateBrowsing();
                else browser.Refresh();
            };
            roomList.JoinRoom += OnJoinClick;
            listTimer.Tick += delegate
            {
                // Nobody is looking at a minimised, background or long-forgotten join page
                if (browser == null || (busy && !Hosting) || WindowState == FormWindowState.Minimized || ActiveForm != this) return;
                if ((DateTime.UtcNow - browseSince).TotalMinutes > BrowseMinutes) return;
                browser.Refresh();
            };
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

            Controls.AddRange(new Control[] { banner, subtitle, version, notice, hostGuide, status, routeDot, routeLabel, marquee, hint, action, secondary, hostCode, players, pauseBar, mapCard, divider, mapDot, mapLabel, devLink, feedbackLink, testBox, autoStartBox, autoEnterBox, modeBar, roomTypeLabel, roomTypeBar, maxLabel, maxButton, roomsTitle, refresh, roomList, codeBox, joinButton });
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
                // A player switching back is usually looking for a friend's room, so the list should not wait for the next tick
                if (browser != null && !(busy && !Hosting))
                {
                    browseSince = DateTime.UtcNow;
                    if ((DateTime.UtcNow - browser.LastAsked).TotalSeconds >= ActivateRefreshSeconds) browser.Refresh();
                }
                else if ((DateTime.UtcNow - badgeAsked).TotalSeconds >= ActivateRefreshSeconds) RefreshBadge();
            };
            Shown += delegate
            {
                UpdateBrowsing();
                RefreshBadge();
                badgeTimer.Start();
            };
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
                })
                { IsBackground = true }.Start();
            };
#endif
        }

        void RefreshIdleMapState()
        {
            if (busy || mapUpdating || (notice.Visible && stickyNotice)) return;
            RefreshMapState();
        }

        int P(float value)
        {
            return (int)Math.Round(value * scale);
        }

        void Relayout()
        {
            banner.SetBounds(0, 0, P(480), P(BannerHeight));
            subtitle.SetBounds(P(20), P(BannerHeight + 12), P(370), P(22));
            version.SetBounds(P(390), P(BannerHeight + 12), P(70), P(22));
            var y = BannerHeight + 42;
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
            // A host looking at the public list leaves its own player list on the host tab
            var showPlayers = playersShown && !(Hosting && joining);
            // The player list and the map card take the place of the buttons below the mode bar
            var replaced = showPlayers || cardShown;
            var browsing = joining && !replaced;
            // A host cannot join anyone, so a room code has nowhere to go
            var typing = browsing && !Hosting;
            // After a game the host picks the next one's difficulty below the player list
            var picking = pickingNext && showPlayers;
            foreach (var mode in modes) mode.Visible = (!joining && !replaced) || picking;
            foreach (var control in new Control[] { roomsTitle, refresh, roomList }) control.Visible = browsing;
            codeBox.Visible = joinButton.Visible = typing;
            players.Visible = showPlayers;
            mapCard.Visible = cardShown && !showPlayers;
            players.SetBounds(P(20), P(y), P(440), P(picking ? 130 : 168));
            mapCard.SetBounds(P(20), P(y), P(440), P(118));
            for (var i = 0; i < modes.Length; i++) modes[i].SetBounds(P(20 + i * 150), P(picking ? y + 142 : y), P(140), P(84));
            var titleWidth = TextRenderer.MeasureText(roomsTitle.Text, roomsTitle.Font).Width + P(4);
            roomsTitle.SetBounds(P(20), P(y), titleWidth, P(28));
            var refreshWidth = Math.Max(P(64), TextRenderer.MeasureText(refresh.Text, refresh.Font).Width + P(24));
            refresh.SetBounds(P(460) - refreshWidth, P(y), refreshWidth, P(28));
            roomList.SetBounds(P(20), P(y + 34), P(440), P(ListHeight));
            var below = y + 34 + ListHeight + 10;
            codeBox.SetBounds(P(20), P(below), P(350), P(36));
            joinButton.SetBounds(P(378), P(below), P(82), P(36));
            y += showPlayers ? (picking ? 142 + 96 : 180) : (cardShown ? 130 : (browsing ? 34 + ListHeight + 10 + (typing ? 36 + 12 : 0) : 96));
            // The host decides before opening whether its own Dota starts too
            autoStartBox.Visible = modeBar.Selected == 1 && !busy && !cardShown;
            if (autoStartBox.Visible)
            {
                autoStartBox.SetBounds(P(20), P(y - 4), autoStartBox.PreferredWidth + P(2), P(22));
                y += 26;
            }
            pauseBar.Visible = showPlayers && paused;
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
            routeDot.Visible = routeLabel.Visible = routeShown && status.Visible && !hostCode.Visible;
            if (routeLabel.Visible)
            {
                var routeWidth = TextRenderer.MeasureText(routeLabel.Text, routeLabel.Font).Width + P(4);
                routeLabel.SetBounds(P(460) - routeWidth, P(y), routeWidth, P(20));
                routeDot.SetBounds(routeLabel.Left - P(10), P(y + 6), P(8), P(8));
                status.Width = routeDot.Left - P(8) - status.Left;
            }
            var actionWidth = Math.Max(P(80), TextRenderer.MeasureText(action.Text, action.Font).Width + P(28));
            var secondaryWidth = Math.Max(P(80), TextRenderer.MeasureText(secondary.Text, secondary.Font).Width + P(28));
            if (hostCode.Visible)
            {
                // A notice about the finished game is taller than the status line it replaces
                var row = notice.Visible ? y + 34 : y;
                hostCode.SetBounds(P(20), P(row + 24), P(150), P(36));
                secondary.SetBounds(P(178), P(row + 24), secondaryWidth, P(36));
                action.SetBounds(P(460) - actionWidth, P(row + 24), actionWidth, P(36));
                // The hosting hint runs to two lines in the longer languages
                hint.SetBounds(P(20), P(row + 66), P(440), P(38));
                y = row;
            }
            else
            {
                // The notice is taller than the status line it replaces
                var row = notice.Visible ? y + 24 : y;
                marquee.SetBounds(P(20), P(row + 26), P(440), P(4));
                hint.SetBounds(P(20), P(row + 36), P(440), P(20));
                // Going back into the game is the one secondary action players want, so it comes first
                var actionLeft = secondary.Visible ? P(20) + secondaryWidth + P(8) : P(20);
                secondary.SetBounds(P(20), P(row + 62), secondaryWidth, P(30));
                action.SetBounds(actionLeft, P(row + 62), actionWidth, P(30));
                autoEnterBox.Visible = joinEnded && busy && modeBar.Selected == 2;
                if (autoEnterBox.Visible) autoEnterBox.SetBounds(action.Right + P(16), P(row + 66), autoEnterBox.PreferredWidth + P(2), P(22));
            }
            // A host looking at the public list leaves its own room controls on the host tab
            var away = Hosting && joining;
            SetHostAreaShown(!away);
            // An idle join page only ever shows a notice in this area, so it needs less room than a launch in progress
            y += away ? 0 : (browsing && !busy ? 60 : 124);
            // Keeps the solo tab as tall as the host tab's room settings row, so switching between them does not resize the window
            if (modeBar.Selected == 0 && !cardShown) y += 42 + (busy ? 0 : 26);
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
            routeDot.Region = new Region(round);
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
                    if (modeBar.Selected != 0) ShowIdleNotice();
                    else if (mapUpdateFailed == id) ShowNotice(NoticeKind.Warning, Strings.MapUpdateFailed, Strings.OpenWorkshop, UpdateOrOpenWorkshop);
                    else ShowNotice(NoticeKind.Warning, Strings.OutdatedNotice, Strings.UpdateMap, UpdateOrOpenWorkshop);
                    break;
                case MapState.Missing:
                    SetFooter(Theme.Error, Strings.MapMissing);
                    ShowNotice(NoticeKind.Error, Strings.NoMap, Strings.Subscribe, () => OpenSteamUrl("steam://url/CommunityFilePage/" + id));
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

        void UpdateOrOpenWorkshop()
        {
            var id = MapId;
            if (mapUpdateFailed == id)
            {
                OpenSteamUrl("steam://url/CommunityFilePage/" + id);
                return;
            }
            if (mapUpdating || busy) return;
            mapUpdating = true;
            SetFooter(Theme.Warning, Strings.MapUpdating);
            new Thread(() =>
            {
                var asked = WorkshopDownload.Run(id);
                UI(() =>
                {
                    mapUpdating = false;
                    DotaInstall checkedInstall;
                    if (!asked || DotaInstall.Check(id, out checkedInstall) == MapState.Outdated) mapUpdateFailed = id;
                    RefreshMapState();
                });
            })
            { IsBackground = true }.Start();
        }

        // Online play needs the latest map, so its tabs show why they cannot start as soon as they open
        void UpdateMapCard(MapState state)
        {
            var show = !busy && modeBar.Selected != 0 && state == MapState.Outdated;
            if (show) mapCard.Show(Strings.MapCardTitle, modeBar.Selected == 1 ? Strings.MapCardHost : Strings.MapCardJoin, mapUpdateFailed == MapId ? Strings.OpenWorkshop : Strings.UpdateMap);
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
            players.MaxPlayers = host != null ? Settings.MaxPlayers : 0;
            if (host != null) players.SetPlayers(host.Snapshot(), selfId, null);
            else if (join != null) players.SetPlayers(join.Roster(), selfId, join.Silent ? Strings.HostSilent : null);
        }

        // The list lives only while the join page is idle and visible, so each visit measures every room once
        void UpdateBrowsing()
        {
            var wanted = (!busy || Hosting) && modeBar.Selected == 2 && !cardShown;
            // Probing opens sockets for a later join, which a host never makes; a room that just closed needs them again
            if (browser != null && browser.Probing == Hosting && (!busy || Hosting))
            {
                browser.Dispose();
                browser = null;
                listTimer.Stop();
            }
            if (wanted && browser == null)
            {
                var created = new RoomBrowser(ListBody, (candidates, symmetric) => PeerBody(candidates, symmetric, InstalledMapVersion()), !Hosting);
                browser = created;
                created.Changed += () => UI(() => { if (browser == created) UpdateRoomList(); });
                roomList.LookOnly = Hosting;
                roomList.SetRooms(OwnRows(), RoomList.ListState.Loading, null);
                browseSince = DateTime.UtcNow;
                created.Start();
                created.Refresh();
                listTimer.Start();
            }
            else if (!wanted && browser != null && (!busy || Hosting))
            {
                browser.Dispose();
                browser = null;
                listTimer.Stop();
            }
        }

        // The host's own room on top, then rooms open to join, then games in progress
        void UpdateRoomList()
        {
            var source = browser;
            if (source == null) return;
            var own = OwnRows();
            var waiting = source.Snapshot();
            if (own.Count > 0) waiting.RemoveAll(r => r.Code == roomCode);
            var games = source.Games();
            var rows = new List<RoomRow>(own);
            if (source.Loaded && (waiting.Count > 0 || games.Count > 0 || own.Count > 0))
            {
                rows.Add(new RoomRow { Kind = RowKind.Header, Text = Strings.SectionWaiting });
                if (waiting.Count > 0) rows.AddRange(waiting);
                else rows.Add(new RoomRow { Kind = RowKind.Empty, Text = Strings.NoRooms });
                if (games.Count > 0)
                {
                    rows.Add(new RoomRow { Kind = RowKind.Header, Text = Strings.SectionPlaying });
                    rows.AddRange(games);
                }
            }
            var state = source.Loaded ? RoomList.ListState.Ready : (source.LoadFailed ? RoomList.ListState.Failed : RoomList.ListState.Loading);
            roomList.SetRooms(rows, state, null);
            if (source.Loaded) ShowBadge(waiting.Count);
        }

        List<RoomRow> OwnRows()
        {
            var list = new List<RoomRow>();
            var roster = hostRoster;
            if (!Hosting || roster == null) return list;
            var row = new RoomRow { Kind = RowKind.Own, Code = roomCode, Map = roomMap, MaxPlayers = Settings.MaxPlayers };
            foreach (var entry in roster.Snapshot())
            {
                if (entry.Status == PlayerStatus.Failed || entry.Status == PlayerStatus.Left) continue;
                row.Avatars.Add(new RoomAvatar { Url = entry.AvatarUrl, Name = entry.Name });
            }
            row.Players = row.Avatars.Count;
            var started = roomStartedAt;
            if (started != null) row.Minutes = (int)(DateTime.UtcNow - started.Value).TotalMinutes;
            list.Add(row);
            return list;
        }

        bool Hosting
        {
            get { return busy && hostRoster != null; }
        }

        // Moved out of sight rather than hidden, since the room flow reads and sets their visibility as its state;
        // they also leave the tab order so a key press cannot reach a button nobody sees
        void SetHostAreaShown(bool shown)
        {
            var area = new Control[] { notice, hostGuide, status, marquee, hint, action, secondary, hostCode, pauseBar };
            if (shown)
            {
                foreach (var pair in hiddenTabStops) pair.Key.TabStop = pair.Value;
                hiddenTabStops.Clear();
                return;
            }
            foreach (var control in area)
            {
                control.Left = -P(2000);
                if (control.ContainsFocus) modeBar.Focus();
                foreach (var item in WithChildren(control))
                {
                    if (hiddenTabStops.ContainsKey(item)) continue;
                    hiddenTabStops[item] = item.TabStop;
                    item.TabStop = false;
                }
            }
        }

        static IEnumerable<Control> WithChildren(Control control)
        {
            yield return control;
            foreach (Control child in control.Controls)
            {
                foreach (var item in WithChildren(child)) yield return item;
            }
        }

        // The count of rooms open to join, kept current while the player is on another tab
        void RefreshBadge()
        {
            if (modeBar.Selected == 2 || WindowState == FormWindowState.Minimized || ActiveForm != this) return;
            if (Interlocked.Exchange(ref badgeLoading, 1) == 1) return;
            badgeAsked = DateTime.UtcNow;
            var body = ListBody();
            // The badge counts rooms the player could join, so a host's own room is left out
            var own = Hosting ? roomCode : null;
            new Thread(() =>
            {
                try
                {
                    var answer = RoomApi.List(body);
                    var count = 0;
                    foreach (Dictionary<string, object> room in (object[])answer["rooms"])
                    {
                        if ((string)room["code"] != own) count++;
                    }
                    UI(() => ShowBadge(count));
                }
                catch (Exception)
                {
                    // The count simply stays as it was until the next try
                }
                finally
                {
                    Interlocked.Exchange(ref badgeLoading, 0);
                }
            })
            { IsBackground = true }.Start();
        }

        void ShowBadge(int count)
        {
            if (modeBar.BadgeCount == count) return;
            modeBar.BadgeCount = count;
            modeBar.Invalidate();
        }

        // Once the room is open the host may switch to the public list; single player stays locked until it closes
        void AllowRoomBrowsing(bool allow)
        {
            modeBar.Locked.Clear();
            if (allow) modeBar.Locked.Add(0);
            modeBar.Dot = allow ? 1 : -1;
            foreach (var control in new Control[] { modeBar, roomList, refresh })
            {
                control.Enabled = allow || !busy;
                control.Invalidate();
            }
        }

        // The picture shrinks onto a shorter strip on black, so the logo stays whole without stretching
        static Image ShortBanner(Image picture)
        {
            const float Shrink = 0.8f;
            var strip = new Bitmap(picture.Width, picture.Width * BannerHeight / 480);
            using (var g = Graphics.FromImage(strip))
            {
                g.Clear(Color.Black);
                g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
                var w = picture.Width * Shrink;
                var h = picture.Height * Shrink;
                g.DrawImage(picture, (strip.Width - w) / 2, (strip.Height - h) / 2, w, h);
            }
            return strip;
        }

        Dictionary<string, object> ListBody()
        {
            return new Dictionary<string, object>
            {
                { "steamId", Platform.SteamAccountId() },
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
            })
            { IsBackground = true }.Start();
        }

        void HideNotice()
        {
            if (!notice.Visible) return;
            notice.Visible = false;
            Relayout();
        }

        void OnModeClick(int index)
        {
            if (busy)
            {
                if (pickingNext && hostTunnel != null) PickNextGame(index);
                return;
            }
            // Steam rewriting the map mid-load stalls the server
            if (mapUpdating) return;
            var state = RefreshMapState();
            // An outdated map only warns, so an unfinished or failed version check does not block starting either
            if (state == MapState.NoSteam || state == MapState.NoDota || state == MapState.Missing) return;
            // Friends must run the same map version, and Steam rewriting the map mid-load stalls the server
            if (modeBar.Selected == 1 && state == MapState.Outdated) return;

            DotaInstall install;
            DotaInstall.Check(MapId, out install);
            var id = MapId;
            var map = MapKeys[index];
            var room = modeBar.Selected == 1;
            roomMap = MapNames[index];
            selfId = Platform.SteamAccountId();
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
                EnsurePortFree();

                if (stopping) throw new OperationCanceledException();
                var manifest = install.InstalledManifest(id);
                var workshopId = id;
                id = PrepareAddon(install, id);

                string code = null, token = null;
                Dictionary<string, object> hostBody = null;
                if (room)
                {
                    selfId = SignedInAccount();
                    UI(() => status.Text = Strings.OpeningRoom);
                    hostTunnel = new HostTunnel();
                    bool publicIp;
                    var candidates = hostTunnel.Gather(out publicIp);
                    hostBody = PeerBody(candidates, hostTunnel.SymmetricNat, manifest);
                    hostBody["publicIp"] = publicIp;
                    lock (seenJoins) seenJoins.Clear();
                    lock (kicked) kicked.Clear();
                    roomEnded = false;
                    roomStartedAt = null;
                    hostRelays = new List<RelayLeg>();
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
                    roster.Add(new RosterEntry { SteamId = selfId, Key = "host", Name = Field(opened, "personaName"), AvatarUrl = Field(opened, "avatarUrl"), Status = Settings.AutoStartDota ? PlayerStatus.Loading : PlayerStatus.InRoom, IsHost = true });
                    hostRoster = roster;
                    hostTunnel.RosterSource = roster.Snapshot;
                    hostTunnel.JoinFinished += OnJoinFinished;
                    hostTunnel.JoinLeft += joinId => roster.SetStatus(joinId, PlayerStatus.Left);
                    hostTunnel.GameTraffic += roster.SetEntering;
                    hostTunnel.Start();
                    var relays = RelayTicket.ReadAddresses(opened, "relayAddresses", "relayAddress");
                    if (relays.Count > 0)
                    {
                        var measuring = hostTunnel;
                        // Measured once per room; joiners add their own to each leg to estimate a relayed route
                        new Thread(() =>
                        {
                            var legs = new List<RelayLeg>();
                            foreach (var relay in relays) legs.Add(new RelayLeg(relay) { Quality = measuring.MeasureRelay(relay) });
                            hostRelays = legs;
                        })
                        { IsBackground = true }.Start();
                    }
                    rosterServer = new RosterServer(roster.Snapshot, () => Settings.MaxPlayers);
                    rosterServer.Start();
                    // The code is ready long before the server, so the host can share it while waiting
                    var shown = code;
                    UI(() =>
                    {
                        hostCode.Code = shown;
                        hostCode.Visible = true;
                        players.CanKick = true;
                        AllowRoomBrowsing(true);
                        ShowPlayers(true);
                        ShowProgress(Strings.RoomCode, "", Strings.Cancel, false);
                        ApplyRoomType();
                    });
                }

                roomGame = 1;
                server = StartServer(install, id, map, room);

                // The code is shown as soon as the room opens, so friends may join while the server is still loading
                if (code != null)
                {
                    roomCode = code;
                    roomToken = token;
                    roomBody = hostBody;
                    StartPolling();
                }

                WaitForMap(map);
                try
                {
                    gate = new LocalGate(Port);
                }
                catch (System.Net.Sockets.SocketException)
                {
                    throw new LaunchError(Strings.PortInUse, false);
                }
                var watch = new ClientWatch();
                clientWatch = watch;
                // A host who only runs the server goes in later from the room, if at all
                if (code == null || Settings.AutoStartDota) EnterGame(install, watch, server.Id);

                UI(() =>
                {
                    foreach (var mode in modes)
                    {
                        mode.ActiveSub = Strings.InGame;
                        mode.Invalidate();
                    }
                    if (code == null) return;
                    hostingReady = true;
                    UpdateHostingHint();
                    action.Text = Strings.CloseRoom;
                    Relayout();
                });
                if (code == null) WatchSolo(install, watch);
                else WatchRoom(install, workshopId, watch);
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

        Process StartServer(DotaInstall install, string addon, string map, bool room)
        {
            logFile = Path.Combine(install.Game, @"dota\dedicated.log");
            if (File.Exists(logFile)) File.Delete(logFile);
            var process = StartDota(new ProcessStartInfo
            {
                FileName = install.Exe,
                WorkingDirectory = install.Game,
                Arguments = "-dedicated -console -allow_no_lobby_connect -ip 127.0.0.1 -port " + Port +
                    " -con_logfile dedicated.log +sv_hibernate_when_empty 0 +dota_quit_after_game 0" +
                    (room ? " +hostname " + RoomHostname : "") +
                    " \"+map " + map + " gamemode=15 customgamemode=" + addon + " nomapvalidation=1\"",
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,
            });
            // The host's own Dota renders on the same PC, and a starved server stalls every player's connection
            try
            {
                process.PriorityClass = ProcessPriorityClass.AboveNormal;
            }
            catch (Exception)
            {
            }
            return process;
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
                if (server.HasExited) throw ServerExitError();
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

        LaunchError ServerExitError()
        {
            var corrupt = CorruptFilesText(ReadShared(logFile));
            if (corrupt == null) return new LaunchError(Strings.ServerExited, true);
            return new LaunchError(corrupt, false) { Button = Strings.VerifyFiles, OnClick = VerifyFiles };
        }

        static void VerifyFiles()
        {
            OpenSteamUrl("steam://validate/570");
        }

        // Damaged files only show up in the log of a Dota that failed fatally; the corruption warning alone does not
        // stop the game, so it counts only next to a fatal error. Returns null when the log shows no damaged files
        internal static string CorruptFilesText(string log)
        {
            var fatal = false;
            var gameFiles = false;
            foreach (var line in log.Split('\n'))
            {
                if (line.Contains(CorruptContent))
                {
                    if (line.Contains("dota_addons") || line.Contains(@"workshop\content")) return Strings.MapCorrupt;
                    gameFiles = true;
                }
                if (line.Contains(LocalContentCorrupt)) gameFiles = true;
                if (line.Contains("FATAL ERROR")) fatal = true;
            }
            return fatal && gameFiles ? Strings.GameFilesCorrupt : null;
        }

        void OnJoinClick(string code)
        {
            if (busy) return;
            if (code.Length != 6)
            {
                ShowNotice(NoticeKind.Error, Strings.InvalidCode, false);
                return;
            }
            if (mapUpdating) return;
            var state = RefreshMapState();
            // Mismatched map versions between host and joiner can break the game, so an outdated map blocks joining
            if (state == MapState.NoSteam || state == MapState.NoDota || state == MapState.Missing || state == MapState.Outdated) return;

            DotaInstall install;
            DotaInstall.Check(MapId, out install);
            var id = MapId;
            selfId = Platform.SteamAccountId();
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
                if (Platform.SteamAccountId() == 0)
                {
                    selfId = SignedInAccount();
                    UI(() => status.Text = Strings.Connecting);
                }
                JoinTunnel tunnel = null;
                List<Candidate> candidates = null;
                var ownRelays = new List<RelayLeg>();
                if (source != null)
                {
                    ownRelays = source.OwnRelays;
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
                if (stopping) throw new OperationCanceledException();
                Dictionary<string, object> joined;
                try
                {
                    var body = PeerBody(candidates, tunnel.SymmetricNat, install.InstalledManifest(id));
                    // Reported with the join so every joiner's route to each relay is recorded without a request of its own
                    var relays = RelayLeg.Encode(ownRelays);
                    if (relays.Count > 0)
                    {
                        body["relays"] = relays;
                        object rtt;
                        if (relays[0].TryGetValue("rtt", out rtt)) body["relayRtt"] = rtt;
                        body["relayLoss"] = relays[0]["loss"];
                    }
                    joined = RoomApi.Join(code, body);
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
                var path = tunnel.Connect((string)joined["joinToken"], hostCandidates, RelayTicket.Read(joined));
                if (stopping) throw new OperationCanceledException();
                if (tunnel.Kicked) throw new LaunchError(Strings.KickedByHost, false);
                if (path == null) throw new LaunchError(Strings.ConnectFailed, false);
                // Runs while Dota restarts, so the route is usually settled before the game connects
                tunnel.Thresholds = RouteThresholds.Read(joined);
                tunnel.StartRouteCheck();

                PrepareAddon(install, id);
                try
                {
                    tunnel.Forward();
                }
                catch (System.Net.Sockets.SocketException)
                {
                    throw new LaunchError(Strings.PortInUse, false);
                }
                var watch = new ClientWatch();
                clientWatch = watch;
                // The host's first roster round says which game the room is on and whether its server is up yet
                for (var waited = 0; waited < JoinStateWaitMs && !tunnel.HasRoster && !stopping; waited += 200) Thread.Sleep(200);
                var entered = tunnel.HasRoster && tunnel.GameReady && !tunnel.GameEnded;
                if (entered) EnterGame(install, watch, -1);

                UI(() =>
                {
                    ShowProgress(string.Format(Strings.Joined, code), "", Strings.LeaveRoom, false);
                    routeShown = true;
                    joinedCode = code;
                    lastConnection = null;
                    RefreshRoute(true);
                });
                WatchJoin(tunnel, install, watch, code, entered);
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

        // The tunnel outlives Dota and each game, so a joiner who left can go back into the same match, and stays in
        // the room for the host's next game until leaving the room
        void WatchJoin(JoinTunnel tunnel, DotaInstall install, ClientWatch client, string code, bool entered)
        {
            var title = string.Format(Strings.Joined, code);
            Presence? shown = null;
            var lifecycle = new JoinLifecycle(tunnel.Game, entered);
            var waitingShown = false;
            while (!stopping)
            {
                Thread.Sleep(1000);
                lifecycle.Observe(tunnel);
                if (lifecycle.State == JoinState.Kicked) throw new LaunchError(Strings.KickedByHost, false);
                if (lifecycle.State == JoinState.Closed) break;
                if (lifecycle.State == JoinState.HostLost) throw new LaunchError(Strings.HostLost, false);
                if (lifecycle.GameChanged) waitingShown = false;
                if (lifecycle.State != JoinState.Ready)
                {
                    endNotice = Strings.GameEnded;
                    if (waitingShown) continue;
                    waitingShown = true;
                    shown = null;
                    UI(() =>
                    {
                        if (busy) ShowJoinEnded(title);
                    });
                    continue;
                }
                if (lifecycle.NewGameReady)
                {
                    endNotice = null;
                    if (lifecycle.FirstGame || (Settings.AutoEnter && DotaClientRunning(-1))) EnterGame(install, client, -1);
                    else
                    {
                        shown = Presence.Out;
                        UI(() =>
                        {
                            if (busy) ShowJoinNewGame(title, install);
                        });
                        continue;
                    }
                }
                var presence = Judge(client, -1);
                if (presence == shown) continue;
                shown = presence;
                UI(() =>
                {
                    if (!busy) return;
                    joinEnded = false;
                    ShowPresence(presence, title, Strings.LeaveRoom, install, -1);
                });
            }
            Finish(null, false);
        }

        void ShowJoinEnded(string title)
        {
            joinEnded = true;
            ShowProgress(title, Strings.GameEnded, Strings.LeaveRoom, false);
            secondary.Visible = false;
            Relayout();
        }

        void ShowJoinNewGame(string title, DotaInstall install)
        {
            joinEnded = false;
            ShowProgress(title, Strings.NewGameStarted, Strings.LeaveRoom, false);
            ShowSecondary(Strings.EnterGame, EnterAction(install, -1), true);
        }

        // The API answers the same room again once the host polls with its token, even after the room lapsed while paused
        void PollRoom()
        {
            var since = DateTime.UtcNow;
            var started = false;
            var qualitySince = DateTime.UtcNow;
            var quality = new List<Dictionary<string, object>>();
            var routeChecks = new List<Dictionary<string, object>>();
            var own = hostTunnel;
            var game = roomGame;
            while (!stopping)
            {
                if (roomGame != game)
                {
                    game = roomGame;
                    started = false;
                    since = DateTime.UtcNow;
                    roomStartedAt = null;
                }
                var elapsed = DateTime.UtcNow - since;
                if (!started && elapsed >= PauseAfter())
                {
                    HideFromList();
                    UI(() => { if (busy && hostTunnel != null) ShowPause(true); });
                    return;
                }
                var wait = started ? GamePollMs : (elapsed.TotalMinutes < FastPollMinutes ? FastPollMs : SlowPollMs);
                // The next game reopens the room to joiners, so its first poll goes out without waiting out a long interval
                for (var waited = 0; waited < wait && roomGame == game && !stopping; waited += 500) Thread.Sleep(500);
                var tunnel = hostTunnel;
                var roster = hostRoster;
                // A room reopened during the sleep has a poller of its own, and this one would mark it started
                if (tunnel == null || tunnel != own || roster == null || stopping) return;
                var startedNow = started || ReadShared(logFile).Contains(HeroSelection);
                var body = new Dictionary<string, object>(roomBody);
                body["code"] = roomCode;
                body["token"] = roomToken;
                body["started"] = startedNow;
                body["game"] = game;
                if (startedNow && roomStartedAt == null) roomStartedAt = DateTime.UtcNow;
                if (roomEnded) body["ended"] = true;
                AddRoomState(body, roster.ActiveCount());
                body["players"] = GuestIds(roster);
                List<Dictionary<string, object>> results;
                lock (joinResults)
                {
                    results = new List<Dictionary<string, object>>(joinResults);
                    joinResults.Clear();
                }
                body["results"] = results;
                // Only the game itself is measured, so the first row starts when the game does
                if (!startedNow)
                {
                    tunnel.TakeQuality();
                    qualitySince = DateTime.UtcNow;
                }
                else if ((DateTime.UtcNow - qualitySince).TotalMilliseconds >= QualityWindowMs)
                {
                    quality.AddRange(tunnel.TakeQuality());
                    qualitySince = DateTime.UtcNow;
                    if (quality.Count > MaxPendingQuality) quality.RemoveRange(0, quality.Count - MaxPendingQuality);
                }
                if (quality.Count > 0) body["quality"] = quality.ToArray();
                routeChecks.AddRange(tunnel.TakeRouteChecks());
                if (routeChecks.Count > MaxPendingQuality) routeChecks.RemoveRange(0, routeChecks.Count - MaxPendingQuality);
                if (routeChecks.Count > 0) body["routeChecks"] = routeChecks.ToArray();
                try
                {
                    var answer = RoomApi.Host(body);
                    quality.Clear();
                    routeChecks.Clear();
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
                        tunnel.AddJoin(joinId, (string)join["joinToken"], candidates, probe, RelayTicket.Read(join));
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

        // Account IDs of everyone else still in the room, so the list can show their avatars
        static long[] GuestIds(HostRoster roster)
        {
            var ids = new List<long>();
            foreach (var entry in roster.Snapshot())
            {
                if (entry.IsHost || entry.SteamId == 0 || entry.Status == PlayerStatus.Failed || entry.Status == PlayerStatus.Left) continue;
                ids.Add(entry.SteamId);
            }
            return ids.ToArray();
        }

        // Sent with the opening request and every poll, so changes the host makes while the room is open reach the list
        void AddRoomState(Dictionary<string, object> body, int playerCount)
        {
            body["public"] = Settings.PublicRoom;
            body["maxPlayers"] = Settings.MaxPlayers;
            body["map"] = roomMap;
            body["playerCount"] = playerCount;
            var relays = RelayLeg.Encode(hostRelays);
            if (relays.Count > 0)
            {
                body["relays"] = relays;
                // Kept for an older API that only reads the first relay
                object rtt;
                if (relays[0].TryGetValue("rtt", out rtt)) body["relayRtt"] = rtt;
                body["relayLoss"] = relays[0]["loss"];
            }
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

        void OnJoinFinished(string joinId, string path, string relayAddress, int elapsedMs)
        {
            var result = new Dictionary<string, object> { { "joinId", joinId }, { "elapsedMs", elapsedMs } };
            if (path != null) result["path"] = path;
            if (relayAddress != null) result["relayAddress"] = relayAddress;
            lock (joinResults) joinResults.Add(result);
            var roster = hostRoster;
            if (roster != null) roster.SetStatus(joinId, path != null ? PlayerStatus.Loading : PlayerStatus.Failed);
        }

        Dictionary<string, object> PeerBody(List<Candidate> candidates, bool? symmetricNat, string mapVersion)
        {
            return new Dictionary<string, object>
            {
                { "mapVersion", mapVersion },
                { "steamId", Platform.SteamAccountId() },
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
        // Rooms tell players apart by their Steam account, which is only known once Steam is running and signed in
        long SignedInAccount()
        {
            var account = Platform.SteamAccountId();
            if (account != 0) return account;
            var steam = DotaInstall.SteamExecutable();
            if (steam == null) throw new LaunchError(Strings.SteamClientMissing, false);
            UI(() => status.Text = Strings.StartingSteam);
            StartDota(new ProcessStartInfo { FileName = steam, Arguments = "-silent", UseShellExecute = false });
            for (var waited = 0; waited < SteamSignInMs; waited += 1000)
            {
                Thread.Sleep(1000);
                if (stopping) throw new OperationCanceledException();
                account = Platform.SteamAccountId();
                if (account != 0) return account;
            }
            throw new LaunchError(Strings.SteamNotSignedIn, false);
        }

        // The dedicated server would fail on a taken port only after the room is open, with nothing the player can read
        static void EnsurePortFree()
        {
            try
            {
                new System.Net.Sockets.UdpClient(new System.Net.IPEndPoint(System.Net.IPAddress.Loopback, Port)).Close();
                new System.Net.Sockets.UdpClient(new System.Net.IPEndPoint(System.Net.IPAddress.Loopback, LocalGate.Port)).Close();
            }
            catch (System.Net.Sockets.SocketException)
            {
                throw new LaunchError(Strings.PortInUse, false);
            }
        }

        static void StartClient(DotaInstall install)
        {
            var steam = DotaInstall.SteamExecutable();
            if (steam == null) throw new LaunchError(Strings.SteamClientMissing, false);
            // Feedback reports attach this log, so it holds only the latest game
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
                // The console stays usable for the connect command shown when Steam cannot hand a running Dota over later
                Arguments = "-applaunch 570 -novid -con_logfile client.log +con_enable 1 +connect 127.0.0.1:" + LocalGate.Port,
                UseShellExecute = false,
            });
        }

        string IdleText()
        {
            if (cardShown) return "";
            if (modeBar.Selected == 1) return Strings.HostIdle;
            return modeBar.Selected == 2 ? "" : Strings.Idle;
        }

        void ShowSecondary(string text, Action onClick, bool primary)
        {
            if (primary) secondary.MakePrimary();
            else secondary.MakePlain();
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
            var g = gate;
            gate = null;
            if (g != null) g.Dispose();
            clientWatch = null;
        }

        // Closing Dota from inside the game ends a solo game; leaving the game with Dota still open keeps it, so the
        // player can go back. Once the results are saved, leaving the game in any way ends it too
        void WatchSolo(DotaInstall install, ClientWatch client)
        {
            var serverId = server.Id;
            long logOffset = 0;
            var end = new GameEnd();
            Presence? shown = null;
            while (!stopping)
            {
                Thread.Sleep(1000);
                end.Track(ReadFrom(logFile, ref logOffset));
                if (server.HasExited)
                {
                    if (end.Ended) break;
                    throw new LaunchError(Strings.ServerExited, true);
                }
                NativeMethods.HideWindowsOf(serverId);
                var presence = Judge(client, serverId);
                if (client.ClosedInGame) break;
                if (end.Saved && presence == Presence.Out) break;
                if (presence == shown) continue;
                shown = presence;
                UI(() =>
                {
                    if (busy) ShowPresence(presence, null, Strings.StopServer, install, serverId);
                });
            }
            Finish(null, false);
        }

        enum Presence { Entering, InGame, Out, Stuck }

        // What the launcher knows about the player's Dota since it last asked it into the game
        class ClientWatch
        {
            public DateTime? AskedAt;
            // Steam moves a Dota that is already open; one it has to start has no deadline, a slow PC can take minutes
            public bool ViaSteam;
            public bool Seen;
            public DateTime? InGameAt;
            public bool ClosedInGame;
        }
        // Dota is in the game while its packets reach the local port, which tells nothing apart from leaving and
        // dropping, so both read as out of the game
        Presence Judge(ClientWatch watch, int serverId)
        {
            var running = DotaClientRunning(serverId);
            var last = LastDotaPacket();
            var now = DateTime.UtcNow;
            lock (watch)
            {
                if (running) watch.Seen = true;
                else if (watch.Seen)
                {
                    watch.Seen = false;
                    watch.AskedAt = null;
                    if (watch.InGameAt != null && (now - watch.InGameAt.Value).TotalMilliseconds <= ClosingGraceMs) watch.ClosedInGame = true;
                }
                var asked = watch.AskedAt;
                var answered = asked != null && last != null && last.Value >= asked.Value;
                if (answered) watch.AskedAt = null;
                Presence presence;
                if (running && last != null && (now - last.Value).TotalMilliseconds <= OutAfterMs && (asked == null || answered)) presence = Presence.InGame;
                else if (asked != null && !answered) presence = watch.ViaSteam && (now - asked.Value).TotalMilliseconds > SteamEnterMs ? Presence.Stuck : Presence.Entering;
                else presence = Presence.Out;
                if (presence == Presence.InGame) watch.InGameAt = now;
                return presence;
            }
        }

        static bool DotaClientRunning(int serverId)
        {
            return DotaProcesses().FindAll(p => p.Id != serverId).Count > 0;
        }

        DateTime? LastDotaPacket()
        {
            var g = gate;
            if (g != null) return g.LastPacket;
            var j = joinTunnel;
            return j == null ? null : j.LastDotaPacket;
        }

        // Steam moves a Dota that is already open onto the local port; one that is closed starts already pointed at it.
        // A failure to start Dota at all is thrown, so the first entry fails the launch the way it always has
        void EnterGame(DotaInstall install, ClientWatch watch, int serverId)
        {
            if (watch == null) return;
            var running = DotaClientRunning(serverId);
            if (!running)
            {
                StartClient(install);
                lock (watch)
                {
                    watch.ViaSteam = false;
                    watch.AskedAt = DateTime.UtcNow;
                }
                return;
            }
            lock (watch)
            {
                watch.ViaSteam = true;
                watch.AskedAt = DateTime.UtcNow;
            }
            try
            {
                // Handed to the Steam executable rather than the shell, because Steam China registers no handler for steam://
                var steam = DotaInstall.SteamExecutable();
                if (steam == null) throw new LaunchError(Strings.SteamClientMissing, false);
                StartDota(new ProcessStartInfo { FileName = steam, Arguments = "\"steam://connect/127.0.0.1:" + LocalGate.Port + "\"", UseShellExecute = false });
            }
            catch (Exception)
            {
                // Without a way to reach Steam the console command is the only way in
                lock (watch) watch.AskedAt = DateTime.UtcNow.AddMilliseconds(-SteamEnterMs);
            }
        }

        // The button stays the way back in; a failure to start Dota stays on screen because nothing else changes
        Action EnterAction(DotaInstall install, int serverId)
        {
            return () =>
            {
                secondary.Visible = false;
                Relayout();
                try
                {
                    EnterGame(install, clientWatch, serverId);
                }
                catch (LaunchError error)
                {
                    ShowNotice(NoticeKind.Error, error.Message, false);
                }
            };
        }

        static void CopyConnect()
        {
            try
            {
                Clipboard.SetText(ConnectCommand);
            }
            catch (Exception)
            {
                // Another program holds the clipboard; the command is on screen to type
            }
        }

        // The status area of a solo game, or of a joiner when the room title is given
        void ShowPresence(Presence presence, string title, string button, DotaInstall install, int serverId)
        {
            string text;
            if (presence == Presence.Entering) text = Strings.EnteringGame;
            else if (presence == Presence.InGame) text = title == null ? Strings.InGame : "";
            else if (presence == Presence.Out) text = Strings.LeftGame;
            else text = "";
            var animate = presence == Presence.Entering;
            if (title == null) ShowProgress(text, presence == Presence.InGame ? Strings.InGameHint : "", button, animate);
            else ShowProgress(title, text, button, animate);
            secondary.Visible = false;
            var enter = EnterAction(install, serverId);
            if (presence == Presence.Out)
            {
                ShowSecondary(Strings.EnterGame, enter, true);
                // A damaged map on the joiner's own PC closes Dota right after it enters, which otherwise reads as leaving
                string corrupt = null;
                try
                {
                    corrupt = CorruptFilesText(ReadShared(Path.Combine(install.Game, @"dota\client.log")));
                }
                catch (IOException)
                {
                }
                if (corrupt != null) ShowNotice(NoticeKind.Error, corrupt, Strings.VerifyFiles, VerifyFiles);
            }
            if (presence == Presence.Stuck)
            {
                ShowNotice(NoticeKind.Warning, Strings.ConsoleSteps, Strings.CopyCommand, CopyConnect);
                hint.Text = Strings.ConsoleTip;
                ShowSecondary(Strings.TryAgain, enter, false);
            }
            Relayout();
        }

        // Friends are still playing on this server, so closing the host's own Dota never stops it. The room outlives
        // each game: once the results are saved the host picks the next difficulty, and only the host closes the room
        void WatchRoom(DotaInstall install, string workshopId, ClientWatch client)
        {
            var serverId = server.Id;
            long logOffset = 0;
            Presence? shown = null;
            var end = new GameEnd();
            var heldSince = DateTime.UtcNow;
            while (!stopping)
            {
                Thread.Sleep(1000);
                var roster = hostRoster;
                var tunnel = hostTunnel;
                if (roster == null || tunnel == null) break;
                var mode = nextMode;
                if (mode >= 0)
                {
                    nextMode = -1;
                    StartNextGame(install, workshopId, mode, client, tunnel, roster);
                    heldSince = DateTime.UtcNow;
                    serverId = server.Id;
                    logOffset = 0;
                    shown = null;
                    end = new GameEnd();
                    continue;
                }
                var text = ReadFrom(logFile, ref logOffset);
                foreach (Match match in Regex.Matches(text, @"Adding player SteamID (\d+)"))
                {
                    roster.SetInGame(long.Parse(match.Groups[1].Value));
                }
                if (!tunnel.GameReady && (roster.InGame("host") || (DateTime.UtcNow - heldSince).TotalMilliseconds >= HostHeadStartMs)) tunnel.GameReady = true;
                var wasEnded = end.Ended;
                if (end.Track(text))
                {
                    if (!wasEnded)
                    {
                        tunnel.GameEnded = true;
                        roomEnded = true;
                        UI(() => ShowRoomEnd(false));
                    }
                    if (end.Saved)
                    {
                        roster.SetAll(PlayerStatus.InRoom);
                        UI(() => ShowRoomEnd(true));
                    }
                }
                // A server left running after its game fails within minutes, which is harmless once the game is over
                if (server.HasExited)
                {
                    if (end.Ended) continue;
                    throw new LaunchError(Strings.ServerExited, true);
                }
                NativeMethods.HideWindowsOf(serverId);
                if (end.Ended) continue;

                var presence = Judge(client, serverId);
                if (presence == shown) continue;
                shown = presence;
                UI(() => ShowHostPresence(presence, false, install, serverId));
            }
            Finish(null, false);
        }

        void PickNextGame(int index)
        {
            DotaInstall checkedInstall;
            var state = DotaInstall.Check(MapId, out checkedInstall);
            // Everyone must run the same map, and Steam rewriting it mid-load stalls the server
            if (state == MapState.Outdated || state == MapState.Missing)
            {
                ShowNotice(NoticeKind.Warning, Strings.NextGameMapOutdated, null, null);
                return;
            }
            HideNotice();
            pickingNext = false;
            endNotice = null;
            saving = false;
            clientClosed = true;
            action.MakePlain();
            for (var i = 0; i < modes.Length; i++)
            {
                modes[i].Active = i == index;
                modes[i].Dimmed = i != index;
                modes[i].ActiveSub = Strings.StartingSub;
                modes[i].Invalidate();
            }
            status.Text = string.Format(Strings.StartingNextGame, modes[index].Title);
            hint.Text = "";
            Relayout();
            nextMode = index;
        }

        // Replaces the finished game's server in the same room; the tunnels stay up, so joiners only need their Dota moved over
        void StartNextGame(DotaInstall install, string workshopId, int mode, ClientWatch client, HostTunnel tunnel, HostRoster roster)
        {
            var old = server;
            if (old != null)
            {
                KillQuietly(old);
                WaitQuietly(old);
            }
            var addon = PrepareAddon(install, workshopId);
            // Starting the server clears the finished game's log, which the poll thread must not read as the new game's
            server = StartServer(install, addon, MapKeys[mode], true);
            roomEnded = false;
            roomMap = MapNames[mode];
            // The poll thread copies this body, so it gets a new one rather than a change under its feet
            var body = new Dictionary<string, object>(roomBody);
            body["mapVersion"] = install.InstalledManifest(workshopId);
            roomBody = body;
            tunnel.GameEnded = false;
            tunnel.GameReady = false;
            roomGame = roomGame + 1;
            tunnel.Game = roomGame;
            roster.SetAll(PlayerStatus.Waiting);
            if (!Settings.AutoStartDota && !DotaClientRunning(server.Id)) roster.SetStatus("host", PlayerStatus.InRoom);
            WaitForMap(MapKeys[mode]);
            // A Dota that is open follows the room; a closed one only starts when the host asked for that
            if (Settings.AutoStartDota || DotaClientRunning(server.Id)) EnterGame(install, client, server.Id);
            else tunnel.GameReady = true;
            UI(() =>
            {
                if (!busy) return;
                foreach (var m in modes)
                {
                    m.ActiveSub = Strings.InGame;
                    m.Invalidate();
                }
                clientClosed = false;
                UpdateHostingHint();
                ApplyRoomType();
            });
        }

        string HostGuideText()
        {
            return Settings.AutoStartDota ? Strings.HostGuide : Strings.HostGuideServerOnly;
        }

        void ShowHostPresence(Presence presence, bool ended, DotaInstall install, int serverId)
        {
            if (!busy || !hostCode.Visible || ended) return;
            var enter = EnterAction(install, serverId);
            clientClosed = presence != Presence.InGame;
            secondary.Visible = false;
            if (presence == Presence.Stuck)
            {
                ShowNotice(NoticeKind.Warning, Strings.ConsoleSteps, Strings.CopyCommand, CopyConnect);
                hint.Text = Strings.ConsoleTip;
                ShowSecondary(Strings.TryAgain, enter, false);
                return;
            }
            HideNotice();
            UpdateHostingHint();
            if (presence == Presence.Entering) status.Text = Strings.EnteringGame;
            if (presence == Presence.Out)
            {
                status.Text = Strings.HostNotInGame;
                ShowSecondary(Strings.EnterGame, enter, true);
            }
            ApplyRoomType();
        }
        // Runs when the game ends and again once its results are saved, when the host can start the next game
        void ShowRoomEnd(bool saved)
        {
            if (!busy || !hostCode.Visible) return;
            saving = !saved;
            endNotice = Strings.GameEnded;
            clientClosed = false;
            secondary.Visible = false;
            pauseBar.Visible = false;
            if (!saved)
            {
                hint.Visible = false;
                ShowNotice(NoticeKind.Warning, Strings.SavingResults, null, null);
                Relayout();
                return;
            }
            HideNotice();
            pickingNext = true;
            status.Text = Strings.NextGamePick;
            hint.Text = Strings.NextGameHint;
            hint.Visible = true;
            for (var i = 0; i < modes.Length; i++)
            {
                modes[i].Active = false;
                modes[i].Dimmed = false;
                modes[i].Invalidate();
            }
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
                if (Settings.PublicRoom) secondary.Visible = false;
                else ShowSecondary(Strings.Copy, hostCode.CopyToClipboard, false);
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
                AllowRoomBrowsing(false);
                secondary.Visible = false;
                hostCode.Visible = false;
                routeShown = false;
                hostingReady = false;
                clientClosed = false;
                saving = false;
                pickingNext = false;
                nextMode = -1;
                joinEnded = false;
                action.MakePlain();
                var ended = endNotice;
                endNotice = null;
                players.CanKick = false;
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

        // Numbers move every few seconds at most, so they stay readable; the end of the route check shows at once
        void RefreshRoute(bool force)
        {
            var tunnel = joinTunnel;
            if (!routeShown || tunnel == null) return;
            var checking = tunnel.Checking;
            if (!force && checking == routeWasChecking && (DateTime.UtcNow - routeRefreshed).TotalMilliseconds < RouteRefreshMs) return;
            routeWasChecking = checking;
            routeRefreshed = DateTime.UtcNow;
            string path;
            var quality = tunnel.Status(out path);
            if (path != null)
            {
                lastConnection = new Dictionary<string, object> { { "path", PathType.Report(path) }, { "roomCode", joinedCode } };
                if (quality.Samples > 0)
                {
                    lastConnection["lossPct"] = quality.Loss;
                    if (quality.Rtt >= 0) lastConnection["rttMs"] = quality.Rtt;
                }
            }
            var color = Theme.Muted;
            var dot = Theme.Ok;
            string text;
            if (checking)
            {
                text = Strings.RouteChecking;
                dot = Theme.Faint;
            }
            else
            {
                var name = path == PathType.Lan ? Strings.RouteLan : path == PathType.Relay ? Strings.RouteRelay : Strings.RouteDirect;
                text = quality.Samples == 0 ? name : string.Format(Strings.RouteQuality, name, quality.Rtt < 0 ? "—" : quality.Rtt.ToString(), quality.Loss);
                if (quality.Samples > 0 && quality.Loss >= RouteWarnLossPct) color = dot = Theme.Warning;
            }
            if (text == routeLabel.Text && color == routeLabel.ForeColor && dot == routeDot.BackColor) return;
            routeLabel.Text = text;
            routeLabel.ForeColor = color;
            routeDot.BackColor = dot;
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

        // Steam China registers no handler for steam://, so the link goes to the Steam executable and the shell is only a fallback
        static void OpenSteamUrl(string url)
        {
            var steam = DotaInstall.SteamExecutable();
            if (steam != null)
            {
                try
                {
                    StartDota(new ProcessStartInfo { FileName = steam, Arguments = "\"" + url + "\"", UseShellExecute = false });
                    return;
                }
                catch (Exception)
                {
                }
            }
            OpenUrl(url);
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
                Connection = modeBar.Selected == 2 ? lastConnection : null,
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
