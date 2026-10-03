using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace Windy10v10AI.Launcher
{
    static class Theme
    {
        public static readonly Color Background = ColorTranslator.FromHtml("#161412");
        public static readonly Color Panel = ColorTranslator.FromHtml("#211d1a");
        public static readonly Color PanelHover = ColorTranslator.FromHtml("#2a2420");
        public static readonly Color ActivePanel = ColorTranslator.FromHtml("#2a1d19");
        public static readonly Color Border = ColorTranslator.FromHtml("#3b3029");
        public static readonly Color Accent = ColorTranslator.FromHtml("#e0552d");
        public static readonly Color AccentHover = ColorTranslator.FromHtml("#f06a40");
        public static readonly Color Text = ColorTranslator.FromHtml("#eee7e0");
        public static readonly Color Muted = ColorTranslator.FromHtml("#aca198");
        public static readonly Color Faint = ColorTranslator.FromHtml("#7f756d");
        public static readonly Color Ok = ColorTranslator.FromHtml("#3fb67a");
        public static readonly Color Warning = ColorTranslator.FromHtml("#e5a93a");
        public static readonly Color WarningPanel = ColorTranslator.FromHtml("#2a2418");
        public static readonly Color WarningBorder = ColorTranslator.FromHtml("#6b5423");
        public static readonly Color Error = ColorTranslator.FromHtml("#e5484d");
        public static readonly Color ErrorPanel = ColorTranslator.FromHtml("#2a1718");
        public static readonly Color ErrorBorder = ColorTranslator.FromHtml("#6b2a2c");

        public const string FontName = "Microsoft YaHei UI";

        // Read from the screen so it is available before any window handle exists
        public static float Dpi
        {
            get { using (var g = Graphics.FromHwnd(IntPtr.Zero)) return g.DpiX; }
        }

        public static GraphicsPath Rounded(RectangleF rect, float radius)
        {
            var d = radius * 2;
            var path = new GraphicsPath();
            path.AddArc(rect.X, rect.Y, d, d, 180, 90);
            path.AddArc(rect.Right - d, rect.Y, d, d, 270, 90);
            path.AddArc(rect.Right - d, rect.Bottom - d, d, d, 0, 90);
            path.AddArc(rect.X, rect.Bottom - d, d, d, 90, 90);
            path.CloseFigure();
            return path;
        }

        // Windows 10 20H1+ and 11 honor attribute 20; earlier Windows 10 builds used 19
        public static void UseDarkTitleBar(IntPtr handle)
        {
            try
            {
                var on = 1;
                if (DwmSetWindowAttribute(handle, 20, ref on, 4) != 0) DwmSetWindowAttribute(handle, 19, ref on, 4);
            }
            catch (Exception)
            {
                // Older Windows without DWM dark mode keeps the default title bar
            }
        }

        [DllImport("dwmapi.dll")]
        static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);
    }

    abstract class PaintedControl : Control
    {
        protected PaintedControl()
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer |
                ControlStyles.ResizeRedraw | ControlStyles.SupportsTransparentBackColor, true);
            BackColor = Theme.Background;
        }

        protected float DpiScale
        {
            get { return Theme.Dpi / 96f; }
        }

        protected static Graphics Prepare(PaintEventArgs e)
        {
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            e.Graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
            return e.Graphics;
        }
    }

    class ModeButton : PaintedControl
    {
        public string Title;
        public string Sub;
        public string ActiveSub;
        public bool Active;
        public bool Dimmed;
        bool hover;

        public ModeButton()
        {
            Cursor = Cursors.Hand;
            TabStop = true;
        }

        protected override void OnMouseEnter(EventArgs e) { hover = true; Invalidate(); base.OnMouseEnter(e); }
        protected override void OnMouseLeave(EventArgs e) { hover = false; Invalidate(); base.OnMouseLeave(e); }
        protected override void OnGotFocus(EventArgs e) { Invalidate(); base.OnGotFocus(e); }
        protected override void OnLostFocus(EventArgs e) { Invalidate(); base.OnLostFocus(e); }

        protected override void OnKeyDown(KeyEventArgs e)
        {
            if (e.KeyCode == Keys.Enter || e.KeyCode == Keys.Space) OnClick(EventArgs.Empty);
            base.OnKeyDown(e);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = Prepare(e);
            var s = Height / 84f;
            var interactive = Enabled && !Dimmed;
            var fill = Active ? Theme.ActivePanel : (hover && interactive ? Theme.PanelHover : Theme.Panel);
            var edge = Active || (interactive && (hover || (Focused && ShowFocusCues))) ? Theme.Accent : Theme.Border;
            var rect = new RectangleF(0.5f, 0.5f, Width - 1.5f, Height - 1.5f);
            using (var path = Theme.Rounded(rect, 8 * s))
            using (var brush = new SolidBrush(fill))
            using (var pen = new Pen(edge, Math.Max(1f, s)))
            {
                g.FillPath(brush, path);
                g.DrawPath(pen, path);
            }

            var d = 28 * s;
            var circle = new RectangleF((Width - d) / 2, 10 * s, d, d);
            using (var brush = new SolidBrush(Theme.Accent)) g.FillEllipse(brush, circle);
            var cx = circle.X + d / 2 + 1.5f * s;
            var cy = circle.Y + d / 2;
            var t = 6 * s;
            g.FillPolygon(Brushes.White, new[] { new PointF(cx - t * 0.8f, cy - t), new PointF(cx + t, cy), new PointF(cx - t * 0.8f, cy + t) });

            using (var titleFont = new Font(Theme.FontName, 13.5f, FontStyle.Bold))
            using (var subFont = new Font(Theme.FontName, 9f))
            {
                TextRenderer.DrawText(g, Title, titleFont, new Rectangle(0, (int)(40 * s), Width, (int)(24 * s)), Theme.Text,
                    TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
                TextRenderer.DrawText(g, Active ? ActiveSub : Sub, subFont, new Rectangle(0, (int)(63 * s), Width, (int)(16 * s)), Theme.Muted,
                    TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
            }

            if (Dimmed)
            {
                using (var veil = new SolidBrush(Color.FromArgb(140, Theme.Background))) g.FillRectangle(veil, ClientRectangle);
            }
        }
    }

    enum NoticeKind { Warning, Error }

    class NoticeBar : PaintedControl
    {
        public NoticeKind Kind;
        public readonly Label Message = new Label();
        public readonly FlatButton Action = new FlatButton();
        bool hasAction;

        public NoticeBar()
        {
            Message.ForeColor = Theme.Text;
            Message.BackColor = Color.Transparent;
            Message.Font = new Font(Theme.FontName, 9f);
            Message.TextAlign = ContentAlignment.MiddleLeft;
            Action.Visible = false;
            Action.Font = new Font(Theme.FontName, 8.25f);
            Controls.Add(Message);
            Controls.Add(Action);
        }

        public void Show(NoticeKind kind, string text, string action)
        {
            if (Visible && Kind == kind && Message.Text == text && hasAction == (action != null)) return;
            Kind = kind;
            Message.Text = text;
            Action.Text = action ?? "";
            hasAction = action != null;
            Action.Visible = hasAction;
            Action.BorderColor = kind == NoticeKind.Error ? Theme.ErrorBorder : Theme.WarningBorder;
            Visible = true;
            LayoutChildren();
            Invalidate();
        }

        protected override void OnResize(EventArgs e)
        {
            base.OnResize(e);
            LayoutChildren();
        }

        void LayoutChildren()
        {
            var s = DpiScale;
            var right = Width - (int)(10 * s);
            // Visible reads false until the window is shown, so layout keys off the requested state
            if (hasAction)
            {
                var w = TextRenderer.MeasureText(Action.Text, Action.Font).Width + (int)(16 * s);
                Action.SetBounds(right - w, (Height - (int)(24 * s)) / 2, w, (int)(24 * s));
                right = Action.Left - (int)(10 * s);
            }
            Message.SetBounds((int)(40 * s), (int)(4 * s), right - (int)(40 * s), Height - (int)(8 * s));
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = Prepare(e);
            var s = DpiScale;
            var fill = Kind == NoticeKind.Error ? Theme.ErrorPanel : Theme.WarningPanel;
            var edge = Kind == NoticeKind.Error ? Theme.ErrorBorder : Theme.WarningBorder;
            var icon = Kind == NoticeKind.Error ? Theme.Error : Theme.Warning;
            using (var path = Theme.Rounded(new RectangleF(0.5f, 0.5f, Width - 1.5f, Height - 1.5f), 8 * s))
            using (var brush = new SolidBrush(fill))
            using (var pen = new Pen(edge, Math.Max(1f, s)))
            {
                g.FillPath(brush, path);
                g.DrawPath(pen, path);
            }
            var cx = 22 * s;
            var cy = Height / 2f;
            using (var pen = new Pen(icon, 1.8f * s) { LineJoin = LineJoin.Round })
            {
                g.DrawPolygon(pen, new[] { new PointF(cx, cy - 9 * s), new PointF(cx + 10 * s, cy + 8 * s), new PointF(cx - 10 * s, cy + 8 * s) });
                g.DrawLine(pen, cx, cy - 3 * s, cx, cy + 2 * s);
                g.DrawLine(pen, cx, cy + 4.5f * s, cx, cy + 5.5f * s);
            }
        }
    }

    // Stands in for real progress, which the server does not report; it only shows the launcher is still working
    class MarqueeBar : PaintedControl
    {
        readonly Timer timer = new Timer { Interval = 16 };
        float position;

        public MarqueeBar()
        {
            timer.Tick += delegate
            {
                position = (position + 0.012f) % 1.4f;
                Invalidate();
            };
        }

        protected override void OnVisibleChanged(EventArgs e)
        {
            timer.Enabled = Visible;
            base.OnVisibleChanged(e);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = Prepare(e);
            var r = Height / 2f;
            using (var track = new SolidBrush(Theme.Border))
            using (var path = Theme.Rounded(new RectangleF(0, 0, Width, Height), r))
            {
                g.FillPath(track, path);
            }
            var segment = Width * 0.3f;
            var x = (position - 0.3f) * Width;
            g.SetClip(new RectangleF(0, 0, Width, Height));
            using (var fill = new SolidBrush(Theme.Accent))
            using (var path = Theme.Rounded(new RectangleF(x, 0, segment, Height), r))
            {
                g.FillPath(fill, path);
            }
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing) timer.Dispose();
            base.Dispose(disposing);
        }
    }

    // The stock flat checkbox renders grey on dark backgrounds and reads as disabled
    class ToggleBox : PaintedControl
    {
        bool isChecked;
        public event EventHandler CheckedChanged;

        public ToggleBox()
        {
            Cursor = Cursors.Hand;
            TabStop = true;
            Font = new Font(Theme.FontName, 8.25f);
        }

        public bool Checked
        {
            get { return isChecked; }
            set
            {
                if (isChecked == value) return;
                isChecked = value;
                Invalidate();
                if (CheckedChanged != null) CheckedChanged(this, EventArgs.Empty);
            }
        }

        public int PreferredWidth
        {
            get { return (int)(20 * DpiScale) + TextRenderer.MeasureText(Text, Font).Width; }
        }

        protected override void OnClick(EventArgs e)
        {
            if (Enabled) Checked = !Checked;
            base.OnClick(e);
        }

        protected override void OnKeyDown(KeyEventArgs e)
        {
            if (e.KeyCode == Keys.Space) OnClick(EventArgs.Empty);
            base.OnKeyDown(e);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = Prepare(e);
            var s = DpiScale;
            var size = 14 * s;
            var box = new RectangleF(0.5f, (Height - size) / 2, size, size);
            using (var path = Theme.Rounded(box, 3 * s))
            {
                if (isChecked)
                {
                    using (var brush = new SolidBrush(Theme.Accent)) g.FillPath(brush, path);
                    using (var pen = new Pen(Color.White, 1.8f * s) { StartCap = LineCap.Round, EndCap = LineCap.Round, LineJoin = LineJoin.Round })
                    {
                        g.DrawLines(pen, new[]
                        {
                            new PointF(box.X + 3.2f * s, box.Y + 7.2f * s),
                            new PointF(box.X + 6f * s, box.Y + 10f * s),
                            new PointF(box.X + 11f * s, box.Y + 4.2f * s),
                        });
                    }
                }
                else
                {
                    using (var pen = new Pen(Theme.Muted, Math.Max(1f, s))) g.DrawPath(pen, path);
                }
            }
            TextRenderer.DrawText(g, Text, Font, new Rectangle((int)(20 * s), 0, Width - (int)(20 * s), Height),
                Enabled ? Theme.Text : Theme.Faint, TextFormatFlags.VerticalCenter | TextFormatFlags.Left | TextFormatFlags.NoPadding);
        }
    }

    // Picks one of a few options; the chosen one gets the accent border the mode buttons use when active
    class SegmentedBar : PaintedControl
    {
        public string[] Items = new string[0];
        int selected;
        int hover = -1;
        public event EventHandler SelectedChanged;

        public SegmentedBar()
        {
            Cursor = Cursors.Hand;
            TabStop = true;
            Font = new Font(Theme.FontName, 9.75f);
        }

        public int Selected
        {
            get { return selected; }
            set
            {
                if (selected == value) return;
                selected = value;
                Invalidate();
                if (SelectedChanged != null) SelectedChanged(this, EventArgs.Empty);
            }
        }

        int IndexAt(int x)
        {
            return Math.Min(Items.Length - 1, Math.Max(0, x * Items.Length / Math.Max(1, Width)));
        }

        protected override void OnMouseMove(MouseEventArgs e) { hover = IndexAt(e.X); Invalidate(); base.OnMouseMove(e); }
        protected override void OnMouseLeave(EventArgs e) { hover = -1; Invalidate(); base.OnMouseLeave(e); }
        protected override void OnGotFocus(EventArgs e) { Invalidate(); base.OnGotFocus(e); }
        protected override void OnLostFocus(EventArgs e) { Invalidate(); base.OnLostFocus(e); }

        protected override void OnMouseClick(MouseEventArgs e)
        {
            if (Enabled) Selected = IndexAt(e.X);
            base.OnMouseClick(e);
        }

        protected override bool IsInputKey(Keys keyData)
        {
            return keyData == Keys.Left || keyData == Keys.Right || base.IsInputKey(keyData);
        }

        protected override void OnKeyDown(KeyEventArgs e)
        {
            if (Enabled && e.KeyCode == Keys.Left && selected > 0) Selected = selected - 1;
            if (Enabled && e.KeyCode == Keys.Right && selected < Items.Length - 1) Selected = selected + 1;
            base.OnKeyDown(e);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = Prepare(e);
            var s = DpiScale;
            var outer = new RectangleF(0.5f, 0.5f, Width - 1.5f, Height - 1.5f);
            using (var path = Theme.Rounded(outer, 8 * s))
            using (var brush = new SolidBrush(Theme.Panel)) g.FillPath(brush, path);

            var pad = 3 * s;
            var gap = 4 * s;
            var w = (Width - 2 * pad - gap * (Items.Length - 1)) / Items.Length;
            for (var i = 0; i < Items.Length; i++)
            {
                var rect = new RectangleF(pad + i * (w + gap), pad, w, Height - 2 * pad - 1);
                var on = i == selected;
                if (on || (Enabled && i == hover))
                {
                    using (var path = Theme.Rounded(rect, 6 * s))
                    using (var brush = new SolidBrush(on ? Theme.ActivePanel : Theme.PanelHover))
                    {
                        g.FillPath(brush, path);
                        if (on || (Focused && ShowFocusCues && i == selected))
                        {
                            using (var pen = new Pen(Theme.Accent, Math.Max(1f, s))) g.DrawPath(pen, path);
                        }
                    }
                }
                var color = on ? Theme.Text : (Enabled ? Theme.Muted : Theme.Faint);
                TextRenderer.DrawText(g, Items[i], Font, Rectangle.Round(rect), color,
                    TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
            }
        }
    }

    // Shows everyone in the room in two columns; the host builds the list and joiners receive it through the tunnel
    class PlayerList : PaintedControl
    {
        static readonly Color Loading = ColorTranslator.FromHtml("#6aa9e9");
        static readonly Color LoadingText = ColorTranslator.FromHtml("#9fc6ef");
        static readonly Color ErrorText = ColorTranslator.FromHtml("#f0868a");
        static readonly Color TagText = ColorTranslator.FromHtml("#f0a283");
        static readonly Color TagBorder = ColorTranslator.FromHtml("#6b4a3a");
        static readonly Color Card = ColorTranslator.FromHtml("#2a2420");
        static readonly Color[] Tints = { ColorTranslator.FromHtml("#9ec7a8"), ColorTranslator.FromHtml("#a9c4e6"), ColorTranslator.FromHtml("#e8cf9a"), ColorTranslator.FromHtml("#c9b6e0"), ColorTranslator.FromHtml("#e6a6a6") };

        List<RosterEntry> players = new List<RosterEntry>();
        long me;
        string banner;
        int scroll;

        public void SetPlayers(List<RosterEntry> list, long self, string warning)
        {
            players = list;
            me = self;
            banner = warning;
            scroll = Math.Max(0, Math.Min(scroll, MaxScroll()));
            Invalidate();
        }

        int Top0 { get { return (int)((banner == null ? 26 : 46) * DpiScale); } }
        int RowHeight { get { return (int)(46 * DpiScale); } }

        int MaxScroll()
        {
            var rows = (players.Count + 1) / 2;
            return Math.Max(0, Top0 + rows * RowHeight - Height);
        }

        protected override void OnMouseWheel(MouseEventArgs e)
        {
            scroll = Math.Max(0, Math.Min(MaxScroll(), scroll - e.Delta / 3));
            Invalidate();
            base.OnMouseWheel(e);
        }

        protected override void OnMouseEnter(EventArgs e)
        {
            // The list scrolls with the wheel only while it holds focus
            Focus();
            base.OnMouseEnter(e);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = Prepare(e);
            var s = DpiScale;
            using (var path = Theme.Rounded(new RectangleF(0.5f, 0.5f, Width - 1.5f, Height - 1.5f), 8 * s))
            using (var brush = new SolidBrush(Theme.Panel))
            using (var pen = new Pen(Theme.Border, Math.Max(1f, s)))
            {
                g.FillPath(brush, path);
                g.DrawPath(pen, path);
            }
            using (var small = new Font(Theme.FontName, 8.25f))
            {
                var pad = (int)(10 * s);
                TextRenderer.DrawText(g, Strings.PlayersInRoom, small, new Rectangle(pad, (int)(6 * s), Width / 2, (int)(16 * s)), Theme.Muted, TextFormatFlags.Left | TextFormatFlags.NoPadding);
                TextRenderer.DrawText(g, string.Format(Strings.PlayerCount, players.Count), small, new Rectangle(Width / 2, (int)(6 * s), Width / 2 - pad, (int)(16 * s)), Theme.Muted, TextFormatFlags.Right | TextFormatFlags.NoPadding);
                if (banner != null)
                {
                    TextRenderer.DrawText(g, banner, small, new Rectangle(pad, (int)(24 * s), Width - 2 * pad, (int)(16 * s)), Theme.Warning, TextFormatFlags.Left | TextFormatFlags.NoPadding);
                }
            }

            var clip = new Rectangle(1, Top0, Width - 2, Height - Top0 - 2);
            g.SetClip(clip);
            var colWidth = (Width - (int)(26 * s)) / 2;
            for (var i = 0; i < players.Count; i++)
            {
                var x = (int)(10 * s) + (i % 2) * (colWidth + (int)(6 * s));
                var y = Top0 + (i / 2) * RowHeight - scroll;
                DrawPlayer(g, players[i], new Rectangle(x, y, colWidth, (int)(40 * s)));
            }
            g.ResetClip();
        }

        void DrawPlayer(Graphics g, RosterEntry player, Rectangle rect)
        {
            var s = DpiScale;
            using (var path = Theme.Rounded(rect, 6 * s))
            using (var brush = new SolidBrush(Card)) g.FillPath(brush, path);

            Color dot, statusColor, nameColor = Theme.Text, ring = Color.Empty;
            string text;
            var fade = 255;
            var dashed = false;
            switch (player.Status)
            {
                case PlayerStatus.Connecting:
                    dot = statusColor = ring = Theme.Warning; text = Strings.StatusConnecting; fade = 190; dashed = true; break;
                case PlayerStatus.Loading:
                    dot = ring = Loading; statusColor = LoadingText; text = Strings.StatusLoading; break;
                case PlayerStatus.Failed:
                    dot = Theme.Error; statusColor = ErrorText; nameColor = Theme.Muted; text = Strings.StatusFailed; fade = 100; break;
                case PlayerStatus.Left:
                    dot = statusColor = nameColor = Theme.Faint; text = Strings.StatusLeft; fade = 90; break;
                default:
                    dot = Theme.Ok; statusColor = Theme.Muted; text = Strings.StatusInGame; break;
            }

            var d = 28 * s;
            var avatar = new RectangleF(rect.X + 8 * s, rect.Y + (rect.Height - d) / 2, d, d);
            if (ring != Color.Empty)
            {
                using (var pen = new Pen(ring, 2 * s))
                {
                    if (dashed) pen.DashPattern = new[] { 2f, 1.5f };
                    g.DrawEllipse(pen, avatar);
                }
            }
            var inner = RectangleF.Inflate(avatar, -3 * s, -3 * s);
            var image = Avatars.Get(player.AvatarUrl);
            using (var circle = new GraphicsPath())
            {
                circle.AddEllipse(inner);
                if (image != null)
                {
                    g.SetClip(circle, CombineMode.Intersect);
                    var attributes = new System.Drawing.Imaging.ImageAttributes();
                    attributes.SetColorMatrix(new System.Drawing.Imaging.ColorMatrix { Matrix33 = fade / 255f });
                    g.DrawImage(image, Rectangle.Round(inner), 0, 0, image.Width, image.Height, GraphicsUnit.Pixel, attributes);
                    g.ResetClip();
                    g.SetClip(new Rectangle(1, Top0, Width - 2, Height - Top0 - 2));
                }
                else
                {
                    var tint = Tints[(int)(Math.Abs(player.SteamId) % Tints.Length)];
                    using (var brush = new SolidBrush(Color.FromArgb(fade, tint))) g.FillPath(brush, circle);
                    var initial = string.IsNullOrEmpty(player.Name) ? "?" : player.Name.Substring(0, 1).ToUpperInvariant();
                    using (var font = new Font(Theme.FontName, 8.25f, FontStyle.Bold))
                    {
                        TextRenderer.DrawText(g, initial, font, Rectangle.Round(inner), Theme.Background,
                            TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
                    }
                }
            }

            var left = (int)(avatar.Right + 8 * s);
            var tag = player.IsHost ? Strings.TagHost : (player.SteamId != 0 && player.SteamId == me ? Strings.TagMe : null);
            using (var nameFont = new Font(Theme.FontName, 9f))
            using (var tagFont = new Font(Theme.FontName, 7f))
            using (var statusFont = new Font(Theme.FontName, 7.5f))
            {
                var tagWidth = tag == null ? 0 : TextRenderer.MeasureText(tag, tagFont).Width + (int)(4 * s);
                var nameWidth = rect.Right - left - (int)(8 * s) - (tag == null ? 0 : tagWidth + (int)(5 * s));
                var nameRect = new Rectangle(left, rect.Y + (int)(4 * s), nameWidth, (int)(18 * s));
                TextRenderer.DrawText(g, player.Name ?? Strings.Player, nameFont, nameRect, nameColor,
                    TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis | TextFormatFlags.NoPadding);
                if (tag != null)
                {
                    var measured = Math.Min(nameWidth, TextRenderer.MeasureText(player.Name ?? Strings.Player, nameFont).Width);
                    var tagRect = new Rectangle(left + measured + (int)(5 * s), nameRect.Y + (int)(2 * s), tagWidth, (int)(14 * s));
                    using (var pen = new Pen(TagBorder, Math.Max(1f, s))) g.DrawRectangle(pen, tagRect);
                    TextRenderer.DrawText(g, tag, tagFont, tagRect, TagText, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
                }
                var dy = rect.Y + (int)(26 * s);
                using (var brush = new SolidBrush(dot)) g.FillEllipse(brush, left, dy - 3 * s, 7 * s, 7 * s);
                TextRenderer.DrawText(g, text, statusFont, new Rectangle(left + (int)(11 * s), dy - (int)(7 * s), rect.Right - left - (int)(19 * s), (int)(15 * s)), statusColor,
                    TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis | TextFormatFlags.NoPadding);
            }
        }
    }

    // Takes the place of the mode buttons when an online mode cannot start, with the one action that helps
    class InfoCard : PaintedControl
    {
        public readonly FlatButton Action = new FlatButton();
        string title = "";
        string body = "";

        public InfoCard()
        {
            Action.MakePrimary();
            Controls.Add(Action);
        }

        public void Show(string heading, string text, string action)
        {
            title = heading;
            body = text;
            Action.Text = action;
            Action.Visible = true;
            LayoutChildren();
            Invalidate();
        }

        protected override void OnResize(EventArgs e)
        {
            base.OnResize(e);
            LayoutChildren();
        }

        void LayoutChildren()
        {
            var s = DpiScale;
            var w = TextRenderer.MeasureText(Action.Text, Action.Font).Width + (int)(28 * s);
            Action.SetBounds((int)(16 * s), Height - (int)(40 * s), w, (int)(30 * s));
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = Prepare(e);
            var s = DpiScale;
            using (var path = Theme.Rounded(new RectangleF(0.5f, 0.5f, Width - 1.5f, Height - 1.5f), 8 * s))
            using (var brush = new SolidBrush(Theme.Panel))
            using (var pen = new Pen(Theme.WarningBorder, Math.Max(1f, s)))
            {
                g.FillPath(brush, path);
                g.DrawPath(pen, path);
            }
            var cx = 24 * s;
            var cy = 20 * s;
            using (var pen = new Pen(Theme.Warning, 1.6f * s) { LineJoin = LineJoin.Round })
            {
                g.DrawPolygon(pen, new[] { new PointF(cx, cy - 7 * s), new PointF(cx + 8 * s, cy + 6 * s), new PointF(cx - 8 * s, cy + 6 * s) });
                g.DrawLine(pen, cx, cy - 2 * s, cx, cy + 2 * s);
            }
            using (var titleFont = new Font(Theme.FontName, 10f, FontStyle.Bold))
            using (var bodyFont = new Font(Theme.FontName, 8.5f))
            {
                TextRenderer.DrawText(g, title, titleFont, new Rectangle((int)(38 * s), (int)(10 * s), Width - (int)(50 * s), (int)(20 * s)), Theme.Text,
                    TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
                TextRenderer.DrawText(g, body, bodyFont, new Rectangle((int)(16 * s), (int)(34 * s), Width - (int)(32 * s), Height - (int)(80 * s)), Theme.Muted,
                    TextFormatFlags.Left | TextFormatFlags.WordBreak | TextFormatFlags.NoPadding);
            }
        }
    }

    class FlatButton : Button
    {
        public FlatButton()
        {
            FlatStyle = FlatStyle.Flat;
            BackColor = Theme.Background;
            ForeColor = Theme.Text;
            Font = new Font(Theme.FontName, 9f);
            Cursor = Cursors.Hand;
            BorderColor = Theme.Border;
            FlatAppearance.MouseOverBackColor = Theme.PanelHover;
            FlatAppearance.MouseDownBackColor = Theme.Panel;
            UseVisualStyleBackColor = false;
        }

        public Color BorderColor
        {
            get { return FlatAppearance.BorderColor; }
            set { FlatAppearance.BorderColor = value; }
        }

        public void MakePrimary()
        {
            BackColor = Theme.Accent;
            ForeColor = Color.White;
            BorderColor = Theme.Accent;
            FlatAppearance.MouseOverBackColor = Theme.AccentHover;
            FlatAppearance.MouseDownBackColor = Theme.Accent;
            Font = new Font(Theme.FontName, 9f, FontStyle.Bold);
        }
    }

    class ConfirmDialog : Form
    {
        ConfirmDialog(string title, string body, string confirm)
        {
            var s = Theme.Dpi / 96f;
            Text = title;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.CenterParent;
            BackColor = Theme.Panel;
            ForeColor = Theme.Text;
            Font = new Font(Theme.FontName, 9.75f);
            ClientSize = new Size((int)(360 * s), (int)(150 * s));

            var heading = new Label { Text = title, Font = new Font(Theme.FontName, 11.25f, FontStyle.Bold), AutoSize = false };
            heading.SetBounds((int)(20 * s), (int)(18 * s), (int)(320 * s), (int)(24 * s));
            var message = new Label { Text = body, AutoSize = false };
            message.SetBounds((int)(20 * s), (int)(46 * s), (int)(320 * s), (int)(48 * s));

            var ok = new FlatButton { Text = confirm, DialogResult = DialogResult.OK };
            ok.MakePrimary();
            var cancel = new FlatButton { Text = Strings.Cancel, DialogResult = DialogResult.Cancel, BackColor = Theme.Panel };
            var okWidth = Math.Max((int)(96 * s), TextRenderer.MeasureText(confirm, ok.Font).Width + (int)(28 * s));
            ok.SetBounds(ClientSize.Width - (int)(20 * s) - okWidth, (int)(104 * s), okWidth, (int)(32 * s));
            cancel.SetBounds(ok.Left - (int)(8 * s) - (int)(80 * s), (int)(104 * s), (int)(80 * s), (int)(32 * s));

            Controls.AddRange(new Control[] { heading, message, cancel, ok });
            AcceptButton = ok;
            CancelButton = cancel;
        }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            Theme.UseDarkTitleBar(Handle);
        }

        public static bool Ask(IWin32Window owner, string title, string body, string confirm)
        {
            using (var dialog = new ConfirmDialog(title, body, confirm))
            {
                return dialog.ShowDialog(owner) == DialogResult.OK;
            }
        }
    }
}
