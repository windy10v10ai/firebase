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
        public static readonly Color OkPanel = ColorTranslator.FromHtml("#17251c");
        public static readonly Color OkBorder = ColorTranslator.FromHtml("#2d5a3e");

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

    enum NoticeKind { Warning, Error, Success }

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
            Action.BorderColor = kind == NoticeKind.Error ? Theme.ErrorBorder : (kind == NoticeKind.Success ? Theme.OkBorder : Theme.WarningBorder);
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
            var success = Kind == NoticeKind.Success;
            var fill = Kind == NoticeKind.Error ? Theme.ErrorPanel : (success ? Theme.OkPanel : Theme.WarningPanel);
            var edge = Kind == NoticeKind.Error ? Theme.ErrorBorder : (success ? Theme.OkBorder : Theme.WarningBorder);
            var icon = Kind == NoticeKind.Error ? Theme.Error : (success ? Theme.Ok : Theme.Warning);
            using (var path = Theme.Rounded(new RectangleF(0.5f, 0.5f, Width - 1.5f, Height - 1.5f), 8 * s))
            using (var brush = new SolidBrush(fill))
            using (var pen = new Pen(edge, Math.Max(1f, s)))
            {
                g.FillPath(brush, path);
                g.DrawPath(pen, path);
            }
            var cx = 22 * s;
            var cy = Height / 2f;
            using (var pen = new Pen(icon, 1.8f * s) { LineJoin = LineJoin.Round, StartCap = LineCap.Round, EndCap = LineCap.Round })
            {
                if (success)
                {
                    g.DrawEllipse(pen, cx - 9 * s, cy - 9 * s, 18 * s, 18 * s);
                    g.DrawLines(pen, new[] { new PointF(cx - 4.5f * s, cy), new PointF(cx - 1 * s, cy + 3.5f * s), new PointF(cx + 5 * s, cy - 3.5f * s) });
                    return;
                }
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
        // Segments that cannot be picked right now, and the one carrying a green dot
        public readonly HashSet<int> Locked = new HashSet<int>();
        public int Dot = -1;
        // A quiet count after one segment's label; zero shows nothing
        public int Badge = -1;
        public int BadgeCount;
        static readonly Color BadgeFill = ColorTranslator.FromHtml("#172230");
        static readonly Color BadgeBorder = ColorTranslator.FromHtml("#2f4a68");
        static readonly Color BadgeText = ColorTranslator.FromHtml("#9fc6ef");
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
            if (Enabled && !Locked.Contains(IndexAt(e.X))) Selected = IndexAt(e.X);
            base.OnMouseClick(e);
        }

        protected override bool IsInputKey(Keys keyData)
        {
            return keyData == Keys.Left || keyData == Keys.Right || base.IsInputKey(keyData);
        }

        protected override void OnKeyDown(KeyEventArgs e)
        {
            if (Enabled && e.KeyCode == Keys.Left && selected > 0 && !Locked.Contains(selected - 1)) Selected = selected - 1;
            if (Enabled && e.KeyCode == Keys.Right && selected < Items.Length - 1 && !Locked.Contains(selected + 1)) Selected = selected + 1;
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
                var locked = Locked.Contains(i);
                if (on || (Enabled && !locked && i == hover))
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
                var color = on ? Theme.Text : (Enabled && !locked ? Theme.Muted : Theme.Faint);
                // The dot, label and count are centred together as one line
                var spacing = 6 * s;
                var width = TextRenderer.MeasureText(Items[i], Font).Width;
                var dot = i == Dot ? 7 * s : 0;
                var count = i == Badge && i != selected && BadgeCount > 0 ? BadgeCount.ToString() : null;
                using (var small = new Font(Theme.FontName, 8.25f, FontStyle.Bold))
                {
                    var pillHeight = 18 * s;
                    var pillWidth = count == null ? 0 : Math.Max(pillHeight, TextRenderer.MeasureText(count, small).Width + 8 * s);
                    var total = width + (dot > 0 ? dot + spacing : 0) + (pillWidth > 0 ? spacing + pillWidth : 0);
                    var left = rect.X + (rect.Width - total) / 2;
                    if (dot > 0)
                    {
                        using (var brush = new SolidBrush(Theme.Ok)) g.FillEllipse(brush, left, rect.Y + (rect.Height - dot) / 2, dot, dot);
                        left += dot + spacing;
                    }
                    TextRenderer.DrawText(g, Items[i], Font, new Rectangle((int)left, (int)rect.Y, width + 2, (int)rect.Height), color,
                        TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
                    if (count != null)
                    {
                        var pill = new RectangleF(left + width + spacing, rect.Y + (rect.Height - pillHeight) / 2, pillWidth, pillHeight);
                        using (var path = Theme.Rounded(pill, pillHeight / 2))
                        using (var fill = new SolidBrush(BadgeFill))
                        using (var pen = new Pen(BadgeBorder, Math.Max(1f, s)))
                        {
                            g.FillPath(fill, path);
                            g.DrawPath(pen, path);
                        }
                        // Centred on the glyph's own outline, since a text box centres the font's line height and leaves a digit low
                        using (var digits = new GraphicsPath())
                        using (var brush = new SolidBrush(BadgeText))
                        {
                            digits.AddString(count, small.FontFamily, (int)small.Style, small.SizeInPoints * g.DpiY / 72f, PointF.Empty, StringFormat.GenericTypographic);
                            var glyph = digits.GetBounds();
                            using (var shift = new Matrix())
                            {
                                shift.Translate(pill.X + (pill.Width - glyph.Width) / 2 - glyph.X, pill.Y + (pill.Height - glyph.Height) / 2 - glyph.Y);
                                digits.Transform(shift);
                            }
                            g.FillPath(brush, digits);
                        }
                    }
                }
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
        // A second click within this window confirms; after it the card goes back to normal by itself
        const int ConfirmMs = 3000;

        enum HitKind { Cross, Confirm, Cancel }

        class Hit
        {
            public Rectangle Rect;
            public string Key;
            public HitKind Kind;
        }

        List<RosterEntry> players = new List<RosterEntry>();
        long me;
        string banner;
        int scroll;
        readonly List<Hit> hits = new List<Hit>();
        Hit hover;
        Rectangle clipArea;
        string confirmKey;
        DateTime confirmUntil;
        readonly Timer confirmTimer = new Timer { Interval = ConfirmMs };

        // Only the host's list offers removing players
        public bool CanKick;
        public event Action<string> Kick;

        public PlayerList()
        {
            confirmTimer.Tick += delegate
            {
                confirmTimer.Stop();
                confirmKey = null;
                Invalidate();
            };
        }

        bool Kickable(RosterEntry player)
        {
            return CanKick && !player.IsHost && player.Key != null && player.Status != PlayerStatus.Failed && player.Status != PlayerStatus.Left;
        }

        void AddHit(Rectangle rect, string key, HitKind kind)
        {
            var visible = Rectangle.Intersect(rect, clipArea);
            if (!visible.IsEmpty) hits.Add(new Hit { Rect = visible, Key = key, Kind = kind });
        }

        Hit HitAt(Point point)
        {
            return hits.Find(h => h.Rect.Contains(point));
        }

        protected override void OnMouseMove(MouseEventArgs e)
        {
            var hit = HitAt(e.Location);
            Cursor = hit != null ? Cursors.Hand : Cursors.Default;
            if (hit != hover)
            {
                hover = hit;
                Invalidate();
            }
            base.OnMouseMove(e);
        }

        protected override void OnMouseLeave(EventArgs e)
        {
            hover = null;
            Invalidate();
            base.OnMouseLeave(e);
        }

        protected override void OnMouseClick(MouseEventArgs e)
        {
            var hit = HitAt(e.Location);
            if (hit != null)
            {
                confirmTimer.Stop();
                confirmKey = null;
                if (hit.Kind == HitKind.Cross)
                {
                    confirmKey = hit.Key;
                    confirmUntil = DateTime.UtcNow.AddMilliseconds(ConfirmMs);
                    confirmTimer.Start();
                }
                else if (hit.Kind == HitKind.Confirm && Kick != null) Kick(hit.Key);
                hover = null;
                Invalidate();
            }
            base.OnMouseClick(e);
        }

        void DrawConfirm(Graphics g, string name, string key, Rectangle rect)
        {
            var s = DpiScale;
            const TextFormatFlags flat = TextFormatFlags.NoPadding | TextFormatFlags.SingleLine | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis;
            using (var font = new Font(Theme.FontName, 8.25f))
            using (var bold = new Font(Theme.FontName, 8.25f, FontStyle.Bold))
            {
                var h = (int)(24 * s);
                var top = rect.Y + (rect.Height - h) / 2;
                var cancelWidth = TextRenderer.MeasureText(Strings.Cancel, font).Width + (int)(14 * s);
                var kickWidth = TextRenderer.MeasureText(Strings.Kick, bold).Width + (int)(14 * s);
                var cancel = new Rectangle(rect.Right - (int)(8 * s) - cancelWidth, top, cancelWidth, h);
                var kick = new Rectangle(cancel.X - (int)(6 * s) - kickWidth, top, kickWidth, h);
                var kickHot = hover != null && hover.Kind == HitKind.Confirm;
                var cancelHot = hover != null && hover.Kind == HitKind.Cancel;
                using (var path = Theme.Rounded(kick, 5 * s))
                using (var brush = new SolidBrush(kickHot ? ColorTranslator.FromHtml("#f0686c") : Theme.Error)) g.FillPath(brush, path);
                TextRenderer.DrawText(g, Strings.Kick, bold, kick, Color.White, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
                using (var path = Theme.Rounded(cancel, 5 * s))
                using (var pen = new Pen(Theme.Border, Math.Max(1f, s)))
                {
                    if (cancelHot)
                    {
                        using (var brush = new SolidBrush(Theme.PanelHover)) g.FillPath(brush, path);
                    }
                    g.DrawPath(pen, path);
                }
                TextRenderer.DrawText(g, Strings.Cancel, font, cancel, Theme.Text, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
                var left = rect.X + (int)(10 * s);
                TextRenderer.DrawText(g, string.Format(Strings.KickConfirm, name), font, new Rectangle(left, rect.Y, kick.X - left - (int)(6 * s), rect.Height), Theme.Text, flat);
                AddHit(kick, key, HitKind.Confirm);
                AddHit(cancel, key, HitKind.Cancel);
            }
        }

        // Zero when the limit is unknown, which shows the count alone
        public int MaxPlayers;

        public void SetPlayers(List<RosterEntry> list, long self, string warning)
        {
            players = list;
            me = self;
            banner = warning;
            scroll = Math.Max(0, Math.Min(scroll, MaxScroll()));
            Invalidate();
        }

        int Top0 { get { return (int)((banner == null ? 26 : 46) * DpiScale); } }
        int RowHeight { get { return (int)(50 * DpiScale); } }

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
                // Counts the same players the host reports to the list, so both read the same number
                var active = players.FindAll(p => p.Status != PlayerStatus.Failed && p.Status != PlayerStatus.Left).Count;
                var count = MaxPlayers > 0 ? active + " / " + MaxPlayers : string.Format(Strings.PlayerCount, active);
                TextRenderer.DrawText(g, count, small, new Rectangle(Width / 2, (int)(6 * s), Width / 2 - pad, (int)(16 * s)), Theme.Muted, TextFormatFlags.Right | TextFormatFlags.NoPadding);
                if (banner != null)
                {
                    TextRenderer.DrawText(g, banner, small, new Rectangle(pad, (int)(24 * s), Width - 2 * pad, (int)(16 * s)), Theme.Warning, TextFormatFlags.Left | TextFormatFlags.NoPadding);
                }
            }

            var clip = new Rectangle(1, Top0, Width - 2, Height - Top0 - 2);
            clipArea = clip;
            hits.Clear();
            g.SetClip(clip);
            var colWidth = (Width - (int)(26 * s)) / 2;
            for (var i = 0; i < players.Count; i++)
            {
                var x = (int)(10 * s) + (i % 2) * (colWidth + (int)(6 * s));
                var y = Top0 + (i / 2) * RowHeight - scroll;
                DrawPlayer(g, players[i], new Rectangle(x, y, colWidth, (int)(44 * s)));
            }
            g.ResetClip();
        }

        void DrawPlayer(Graphics g, RosterEntry player, Rectangle rect)
        {
            var s = DpiScale;
            var name = string.IsNullOrEmpty(player.Name) ? Strings.Player : player.Name;
            using (var path = Theme.Rounded(rect, 6 * s))
            using (var brush = new SolidBrush(Card)) g.FillPath(brush, path);
            // The confirmation replaces the whole card, so a stray click on the cross never removes anyone
            if (Kickable(player) && player.Key == confirmKey && DateTime.UtcNow < confirmUntil)
            {
                DrawConfirm(g, name, player.Key, rect);
                return;
            }

            Color dot, statusColor, nameColor = Theme.Text, ring = Color.Empty;
            string text;
            var fade = 255;
            var dashed = false;
            switch (player.Status)
            {
                case PlayerStatus.Connecting:
                    dot = statusColor = ring = Theme.Warning; text = Strings.StatusConnecting; fade = 190; dashed = true; break;
                case PlayerStatus.Loading:
                    // The host has no route to establish, so its own row only loads
                    dot = ring = Loading; statusColor = LoadingText; text = player.IsHost ? Strings.StatusHostLoading : Strings.StatusLoading; break;
                case PlayerStatus.Failed:
                    dot = Theme.Error; statusColor = ErrorText; nameColor = Theme.Muted; text = Strings.StatusFailed; fade = 100; break;
                case PlayerStatus.Left:
                    dot = statusColor = nameColor = Theme.Faint; text = Strings.StatusLeft; fade = 90; break;
                default:
                    dot = Theme.Ok; statusColor = Theme.Muted; text = Strings.StatusInGame; break;
            }

            var d = 38 * s;
            var avatar = new RectangleF(rect.X + 8 * s, rect.Y + (rect.Height - d) / 2, d, d);
            if (ring != Color.Empty)
            {
                using (var pen = new Pen(ring, 2 * s))
                {
                    if (dashed) pen.DashPattern = new[] { 2f, 1.5f };
                    g.DrawEllipse(pen, avatar);
                }
            }
            AvatarPainter.Draw(g, RectangleF.Inflate(avatar, -3 * s, -3 * s), player.AvatarUrl, name, player.SteamId, fade);

            var right = rect.Right;
            if (Kickable(player))
            {
                var size = (int)(22 * s);
                var cross = new Rectangle(rect.Right - size - (int)(6 * s), rect.Y + (rect.Height - size) / 2, size, size);
                var hot = hover != null && hover.Kind == HitKind.Cross && hover.Key == player.Key;
                if (hot)
                {
                    using (var path = Theme.Rounded(cross, 5 * s))
                    using (var brush = new SolidBrush(Theme.ErrorPanel)) g.FillPath(brush, path);
                }
                var c = 5 * s;
                var cx = cross.X + cross.Width / 2f;
                var cy = cross.Y + cross.Height / 2f;
                using (var pen = new Pen(hot ? Theme.Error : Theme.Faint, 1.8f * s) { StartCap = LineCap.Round, EndCap = LineCap.Round })
                {
                    g.DrawLine(pen, cx - c, cy - c, cx + c, cy + c);
                    g.DrawLine(pen, cx + c, cy - c, cx - c, cy + c);
                }
                AddHit(cross, player.Key, HitKind.Cross);
                right = cross.X;
            }

            var left = (int)(avatar.Right + 8 * s);
            var tag = player.IsHost ? Strings.TagHost : (player.SteamId != 0 && player.SteamId == me ? Strings.TagMe : null);
            const TextFormatFlags measure = TextFormatFlags.NoPadding | TextFormatFlags.SingleLine;
            const TextFormatFlags flat = measure | TextFormatFlags.Left | TextFormatFlags.EndEllipsis;
            using (var nameFont = new Font(Theme.FontName, 10f))
            using (var tagFont = new Font(Theme.FontName, 7f))
            using (var statusFont = new Font(Theme.FontName, 7.5f))
            {
                // The CJK font's line box is taller than its point size, so both lines are measured and centred as one block
                var nameSize = TextRenderer.MeasureText(g, name, nameFont, Size.Empty, measure);
                var statusSize = TextRenderer.MeasureText(g, text, statusFont, Size.Empty, measure);
                var top = rect.Y + (rect.Height - nameSize.Height - statusSize.Height) / 2;
                var tagSize = tag == null ? Size.Empty : TextRenderer.MeasureText(g, tag, tagFont, Size.Empty, measure);
                var tagWidth = tag == null ? 0 : tagSize.Width + (int)(8 * s);
                var nameWidth = Math.Min(nameSize.Width, right - left - (int)(8 * s) - (tag == null ? 0 : tagWidth + (int)(5 * s)));
                TextRenderer.DrawText(g, name, nameFont, new Rectangle(left, top, nameWidth, nameSize.Height), nameColor, flat);
                if (tag != null)
                {
                    var tagRect = new RectangleF(left + nameWidth + 5 * s, top + (nameSize.Height - tagSize.Height - 2 * s) / 2, tagWidth, tagSize.Height + 2 * s);
                    using (var path = Theme.Rounded(tagRect, 3 * s))
                    using (var pen = new Pen(TagBorder, Math.Max(1f, s))) g.DrawPath(pen, path);
                    TextRenderer.DrawText(g, tag, tagFont, new Point((int)(tagRect.X + 4 * s), (int)(tagRect.Y + s)), TagText, TextFormatFlags.NoPadding);
                }
                var statusTop = top + nameSize.Height;
                var d7 = 7 * s;
                using (var brush = new SolidBrush(dot)) g.FillEllipse(brush, left, statusTop + (statusSize.Height - d7) / 2, d7, d7);
                TextRenderer.DrawText(g, text, statusFont, new Rectangle(left + (int)(11 * s), statusTop, right - left - (int)(19 * s), statusSize.Height), statusColor, flat);
            }
        }
    }

    // The room code in a box sized to match the copy button beside it, characters spaced so it reads aloud easily
    class CodeDisplay : PaintedControl
    {
        string code = "";

        public string Code
        {
            get { return code; }
            set { code = value ?? ""; Invalidate(); }
        }

        // A public room is found in the list, so its code stays in small print rather than inviting players to share it
        bool quiet;

        public bool Quiet
        {
            get { return quiet; }
            set { quiet = value; Invalidate(); }
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = Prepare(e);
            var s = DpiScale;
            if (quiet)
            {
                using (var small = new Font(Theme.FontName, 9f))
                {
                    TextRenderer.DrawText(g, Strings.RoomCode + "  " + code, small, ClientRectangle, Theme.Faint,
                        TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
                }
                return;
            }
            using (var path = Theme.Rounded(new RectangleF(0.5f, 0.5f, Width - 1.5f, Height - 1.5f), 6 * s))
            using (var brush = new SolidBrush(Theme.Panel))
            using (var pen = new Pen(Theme.Border, Math.Max(1f, s)))
            {
                g.FillPath(brush, path);
                g.DrawPath(pen, path);
            }
            if (code.Length == 0) return;
            using (var font = new Font("Consolas", 15f))
            {
                var cell = (Width - 24 * s) / code.Length;
                for (var i = 0; i < code.Length; i++)
                {
                    var rect = new Rectangle((int)(12 * s + i * cell), 0, (int)cell, Height);
                    TextRenderer.DrawText(g, code.Substring(i, 1), font, rect, Theme.Text,
                        TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
                }
            }
        }
    }

    // A painted box for typing the room code: a TextBox cannot round its border or space its letters
    class CodeInput : PaintedControl
    {
        const int MaxLength = 6;
        const string Alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
        string code = "";
        string seenClipboard;
        public string Placeholder = "";
        public event EventHandler Submit;
        public event EventHandler CodeChanged;

        public CodeInput()
        {
            SetStyle(ControlStyles.Selectable, true);
            TabStop = true;
            ImeMode = ImeMode.Disable;
            Cursor = Cursors.IBeam;
            var menu = new ContextMenuStrip();
            menu.Items.Add(Strings.Paste, null, delegate { Paste(); });
            ContextMenuStrip = menu;
            seenClipboard = ReadClipboard();
        }

        static string ReadClipboard()
        {
            try
            {
                return Clipboard.ContainsText() ? Clipboard.GetText() : null;
            }
            catch (Exception)
            {
                // Another program may hold the clipboard open
                return null;
            }
        }

        void Paste()
        {
            var text = ReadClipboard();
            if (text != null) Append(text, 0);
        }

        // Friends copy the code from a chat app after opening the launcher, so only a newly copied code fills the box;
        // whatever was on the clipboard at launch is usually a code from an earlier game
        public void FillFromClipboard()
        {
            var text = ReadClipboard();
            if (text == null || text == seenClipboard) return;
            seenClipboard = text;
            text = text.Trim().ToUpperInvariant();
            if (text.Length != MaxLength) return;
            foreach (var c in text)
            {
                if (Alphabet.IndexOf(c) < 0) return;
            }
            code = text;
            if (CodeChanged != null) CodeChanged(this, EventArgs.Empty);
            Invalidate();
        }

        public string Code
        {
            get { return code; }
        }

        protected override void OnMouseDown(MouseEventArgs e)
        {
            Focus();
            base.OnMouseDown(e);
        }

        protected override void OnGotFocus(EventArgs e) { Invalidate(); base.OnGotFocus(e); }
        protected override void OnLostFocus(EventArgs e) { Invalidate(); base.OnLostFocus(e); }
        protected override void OnEnabledChanged(EventArgs e) { Invalidate(); base.OnEnabledChanged(e); }

        protected override bool IsInputKey(Keys keyData)
        {
            return keyData == Keys.Back || base.IsInputKey(keyData);
        }

        protected override void OnKeyDown(KeyEventArgs e)
        {
            if (e.KeyCode == Keys.Enter && Submit != null) Submit(this, EventArgs.Empty);
            else if (e.KeyCode == Keys.Back && code.Length > 0) Append(null, code.Length - 1);
            else if ((e.Control && e.KeyCode == Keys.V) || (e.Shift && e.KeyCode == Keys.Insert)) Paste();
            base.OnKeyDown(e);
        }

        protected override void OnKeyPress(KeyPressEventArgs e)
        {
            if (char.IsLetterOrDigit(e.KeyChar)) Append(e.KeyChar.ToString(), code.Length);
            e.Handled = true;
        }

        // Pasted text keeps only letters and digits so a code copied with spaces or quotes still fits
        void Append(string text, int keep)
        {
            var next = code.Substring(0, keep);
            if (text != null)
            {
                foreach (var c in text.ToUpperInvariant())
                {
                    if (char.IsLetterOrDigit(c) && c < 128) next += c;
                }
            }
            if (next.Length > MaxLength) next = next.Substring(0, MaxLength);
            if (next == code) return;
            code = next;
            if (CodeChanged != null) CodeChanged(this, EventArgs.Empty);
            Invalidate();
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = Prepare(e);
            var s = DpiScale;
            var border = Focused && Enabled ? Theme.Accent : Theme.Border;
            using (var path = Theme.Rounded(new RectangleF(0.5f, 0.5f, Width - 1.5f, Height - 1.5f), 6 * s))
            using (var brush = new SolidBrush(Theme.Panel))
            using (var pen = new Pen(border, Math.Max(1f, s)))
            {
                g.FillPath(brush, path);
                g.DrawPath(pen, path);
            }
            var left = 14 * s;
            if (code.Length == 0)
            {
                using (var font = new Font(Theme.FontName, 10f))
                {
                    TextRenderer.DrawText(g, Placeholder, font, new Rectangle((int)left, 0, Width - (int)left, Height), Theme.Faint,
                        TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
                }
            }
            var cell = 20 * s;
            using (var font = new Font("Consolas", 15f))
            {
                for (var i = 0; i < code.Length; i++)
                {
                    TextRenderer.DrawText(g, code.Substring(i, 1), font, new Rectangle((int)(left + i * cell), 0, (int)cell, Height),
                        Enabled ? Theme.Text : Theme.Muted, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
                }
            }
            if (Focused && Enabled && code.Length < MaxLength)
            {
                var x = left + code.Length * cell + (code.Length == 0 ? 0 : 2 * s);
                using (var pen = new Pen(Theme.Text, Math.Max(1f, s))) g.DrawLine(pen, x, Height * 0.28f, x, Height * 0.72f);
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

    static class AvatarPainter
    {
        static readonly Color[] Tints = { ColorTranslator.FromHtml("#9ec7a8"), ColorTranslator.FromHtml("#a9c4e6"), ColorTranslator.FromHtml("#e8cf9a"), ColorTranslator.FromHtml("#c9b6e0"), ColorTranslator.FromHtml("#e6a6a6") };

        // The Steam picture in a circle, or the name's initial on a tint until the picture arrives
        public static void Draw(Graphics g, RectangleF inner, string url, string name, long seed, int fade)
        {
            var image = Avatars.Get(url);
            if (image != null)
            {
                // A clip region has hard edges, so the picture is shrunk first and painted as an anti-aliased fill
                var box = Rectangle.Round(inner);
                using (var scaled = new Bitmap(box.Width, box.Height))
                {
                    using (var sg = Graphics.FromImage(scaled))
                    using (var attributes = new System.Drawing.Imaging.ImageAttributes())
                    {
                        // Steam's picture is several times larger than the circle, and the default filter blurs a shrink that big
                        sg.InterpolationMode = InterpolationMode.HighQualityBicubic;
                        sg.PixelOffsetMode = PixelOffsetMode.HighQuality;
                        attributes.SetColorMatrix(new System.Drawing.Imaging.ColorMatrix { Matrix33 = fade / 255f });
                        attributes.SetWrapMode(WrapMode.TileFlipXY);
                        sg.DrawImage(image, new Rectangle(0, 0, box.Width, box.Height), 0, 0, image.Width, image.Height, GraphicsUnit.Pixel, attributes);
                    }
                    using (var brush = new TextureBrush(scaled))
                    {
                        brush.TranslateTransform(box.X, box.Y);
                        g.FillEllipse(brush, box);
                    }
                }
                return;
            }
            var tint = Tints[(int)(Math.Abs(seed) % Tints.Length)];
            using (var brush = new SolidBrush(Color.FromArgb(fade, tint))) g.FillEllipse(brush, inner);
            var initial = string.IsNullOrEmpty(name) ? "?" : name.Substring(0, 1).ToUpperInvariant();
            using (var font = new Font(Theme.FontName, 8.25f, FontStyle.Bold))
            {
                TextRenderer.DrawText(g, initial, font, Rectangle.Round(inner), Theme.Background,
                    TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
            }
        }
    }

    // The public rooms on the join page. Rooms this network cannot reach stay listed, greyed out, so a player whose
    // network fails every probe sees why rather than an empty list
    class RoomList : PaintedControl
    {
        public enum ListState { Loading, Failed, Ready }

        // Mixed into the panel colour for rows that cannot be joined
        const float FadeAlpha = 0.45f;

        List<RoomRow> rooms = new List<RoomRow>();
        ListState state = ListState.Loading;
        string banner;
        int scroll;
        int hoverRow = -1;
        bool hoverButton;
        float spin;
        int ticks;
        string tipText;
        readonly Timer timer = new Timer { Interval = 50 };
        readonly ToolTip tip = new ToolTip();
        public event Action<string> JoinRoom;

        public RoomList()
        {
            timer.Tick += delegate
            {
                spin = (spin + 18) % 360;
                ticks++;
                // Avatars arrive in the background, so the list also repaints now and then without a spinner
                if (rooms.Exists(r => r.Probe == ProbeState.Testing) || ticks % 20 == 0) Invalidate();
            };
        }

        public void SetRooms(List<RoomRow> list, ListState listState, string warning)
        {
            rooms = list;
            state = listState;
            banner = warning;
            scroll = Math.Max(0, Math.Min(scroll, MaxScroll()));
            Invalidate();
        }

        public bool HasBanner
        {
            get { return banner != null; }
        }

        // A host only looks at the list, so rooms show no latency and cannot be joined
        public bool LookOnly;

        protected override void OnVisibleChanged(EventArgs e)
        {
            timer.Enabled = Visible;
            base.OnVisibleChanged(e);
        }

        int BannerHeight { get { return banner == null ? 0 : (int)(20 * DpiScale); } }
        int BoxTop { get { return BannerHeight + (int)(22 * DpiScale); } }

        int HeightOf(RoomRow row)
        {
            return (int)((row.Kind == RowKind.Header ? 24 : 52) * DpiScale);
        }

        int ContentHeight()
        {
            var total = 0;
            foreach (var row in rooms) total += HeightOf(row);
            return total;
        }

        int MaxScroll()
        {
            return Math.Max(0, ContentHeight() - (Height - BoxTop - 2));
        }

        int ButtonWidth
        {
            get
            {
                using (var font = new Font(Theme.FontName, 9f, FontStyle.Bold))
                {
                    var widest = Math.Max(TextRenderer.MeasureText(Strings.Join, font).Width, TextRenderer.MeasureText(Strings.Full, font).Width);
                    return Math.Max((int)(56 * DpiScale), widest + (int)(16 * DpiScale));
                }
            }
        }

        // Column edges from the right, shared by the header and every row
        void Columns(out int mapLeft, out int countLeft, out int pingLeft, out int buttonLeft)
        {
            var s = DpiScale;
            buttonLeft = Width - (int)(12 * s) - ButtonWidth;
            pingLeft = buttonLeft - (int)(10 * s) - (int)(40 * s);
            countLeft = pingLeft - (int)(6 * s) - (int)(44 * s);
            mapLeft = countLeft - (int)(8 * s) - (int)(56 * s);
        }

        Rectangle RowRect(int index)
        {
            var top = BoxTop + 1 - scroll;
            for (var i = 0; i < index; i++) top += HeightOf(rooms[i]);
            return new Rectangle(1, top, Width - 2, HeightOf(rooms[index]));
        }

        Rectangle ButtonRect(Rectangle row)
        {
            int mapLeft, countLeft, pingLeft, buttonLeft;
            Columns(out mapLeft, out countLeft, out pingLeft, out buttonLeft);
            var h = (int)(30 * DpiScale);
            return new Rectangle(buttonLeft, row.Y + (row.Height - h) / 2, ButtonWidth, h);
        }

        Rectangle PingRect(Rectangle row)
        {
            int mapLeft, countLeft, pingLeft, buttonLeft;
            Columns(out mapLeft, out countLeft, out pingLeft, out buttonLeft);
            return new Rectangle(pingLeft, row.Y, (int)(40 * DpiScale), row.Height);
        }

        int RowAt(Point point)
        {
            if (point.Y < BoxTop || point.Y >= Height - 1) return -1;
            var top = BoxTop + 1 - scroll;
            for (var i = 0; i < rooms.Count; i++)
            {
                var bottom = top + HeightOf(rooms[i]);
                if (point.Y >= top && point.Y < bottom) return i;
                top = bottom;
            }
            return -1;
        }

        bool CanJoin(RoomRow room)
        {
            return room.Joinable && !LookOnly && Enabled;
        }

        protected override void OnMouseMove(MouseEventArgs e)
        {
            var row = RowAt(e.Location);
            var onButton = row >= 0 && rooms[row].Kind == RowKind.Waiting && ButtonRect(RowRect(row)).Contains(e.Location);
            string text = null;
            if (row >= 0 && rooms[row].Kind == RowKind.Waiting && !LookOnly && PingRect(RowRect(row)).Contains(e.Location)) text = PingTip(rooms[row]);
            if (text != tipText)
            {
                tipText = text;
                tip.SetToolTip(this, text ?? "");
            }
            Cursor = onButton && CanJoin(rooms[row]) ? Cursors.Hand : Cursors.Default;
            if (row != hoverRow || onButton != hoverButton)
            {
                hoverRow = row;
                hoverButton = onButton;
                Invalidate();
            }
            base.OnMouseMove(e);
        }

        protected override void OnMouseLeave(EventArgs e)
        {
            hoverRow = -1;
            hoverButton = false;
            Invalidate();
            base.OnMouseLeave(e);
        }

        protected override void OnMouseEnter(EventArgs e)
        {
            // The list scrolls with the wheel only while it holds focus, but typing a room code keeps its focus
            var form = FindForm();
            if (form == null || !(form.ActiveControl is CodeInput)) Focus();
            base.OnMouseEnter(e);
        }

        protected override void OnMouseWheel(MouseEventArgs e)
        {
            scroll = Math.Max(0, Math.Min(MaxScroll(), scroll - e.Delta / 3));
            Invalidate();
            base.OnMouseWheel(e);
        }

        protected override void OnMouseClick(MouseEventArgs e)
        {
            var row = RowAt(e.Location);
            if (row >= 0 && CanJoin(rooms[row]) && ButtonRect(RowRect(row)).Contains(e.Location) && JoinRoom != null) JoinRoom(rooms[row].Code);
            base.OnMouseClick(e);
        }

        static string PingTip(RoomRow room)
        {
            if (room.Probe == ProbeState.Testing) return Strings.ProbeTesting;
            if (room.Probe == ProbeState.Unreachable) return room.RelayRtt >= 0 ? string.Format(Strings.ProbeRelayLatency, room.RelayRtt) : null;
            if (room.Probe == ProbeState.Reachable) return string.Format(Strings.ProbeLatency, room.Rtt);
            return null;
        }

        public static string MapName(string map)
        {
            switch (map)
            {
                case "easy": return Strings.Easy;
                case "hard": return Strings.Hard;
                case "custom": return Strings.Custom;
                default: return "";
            }
        }

        static Color Fade(Color color, bool faded)
        {
            if (!faded) return color;
            return Color.FromArgb(
                (int)(color.R * FadeAlpha + Theme.Panel.R * (1 - FadeAlpha)),
                (int)(color.G * FadeAlpha + Theme.Panel.G * (1 - FadeAlpha)),
                (int)(color.B * FadeAlpha + Theme.Panel.B * (1 - FadeAlpha)));
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = Prepare(e);
            var s = DpiScale;
            int mapLeft, countLeft, pingLeft, buttonLeft;
            Columns(out mapLeft, out countLeft, out pingLeft, out buttonLeft);
            const TextFormatFlags line = TextFormatFlags.NoPadding | TextFormatFlags.SingleLine | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis;
            using (var small = new Font(Theme.FontName, 8.25f))
            {
                if (banner != null)
                {
                    TextRenderer.DrawText(g, banner, small, new Rectangle(0, 0, Width, BannerHeight - (int)(4 * s)), Theme.Warning, line | TextFormatFlags.Left);
                }
                var header = new Rectangle(0, BannerHeight, 0, (int)(18 * s));
                TextRenderer.DrawText(g, Strings.ColumnMap, small, new Rectangle(mapLeft, header.Y, countLeft - mapLeft, header.Height), Theme.Muted, line | TextFormatFlags.Left);
                TextRenderer.DrawText(g, Strings.ColumnPlayers, small, new Rectangle(countLeft, header.Y, pingLeft - countLeft - (int)(6 * s), header.Height), Theme.Muted, line | TextFormatFlags.Right);
                TextRenderer.DrawText(g, Strings.ColumnPing, small, new Rectangle(pingLeft - (int)(10 * s), header.Y, (int)(60 * s), header.Height), Theme.Muted, line | TextFormatFlags.HorizontalCenter);
            }

            var box = new RectangleF(0.5f, BoxTop + 0.5f, Width - 1.5f, Height - BoxTop - 1.5f);
            using (var path = Theme.Rounded(box, 6 * s))
            using (var brush = new SolidBrush(Theme.Panel))
            using (var pen = new Pen(Theme.Border, Math.Max(1f, s)))
            {
                g.FillPath(brush, path);
                g.DrawPath(pen, path);
            }

            if (rooms.Count == 0)
            {
                var message = state == ListState.Loading ? Strings.RoomsLoading : (state == ListState.Failed ? Strings.RoomsFailed : Strings.NoRooms);
                using (var font = new Font(Theme.FontName, 9f))
                {
                    TextRenderer.DrawText(g, message, font, Rectangle.Round(box), Theme.Muted,
                        TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.WordBreak);
                }
                return;
            }

            // Rounded so a filled row at the top or bottom keeps the box's corners
            using (var inner = Theme.Rounded(new RectangleF(1, BoxTop + 1, Width - 2, Height - BoxTop - 2), 5 * s)) g.SetClip(inner);
            var top = BoxTop + 1 - scroll;
            for (var i = 0; i < rooms.Count; i++)
            {
                var row = new Rectangle(1, top, Width - 2, HeightOf(rooms[i]));
                top = row.Bottom;
                if (row.Bottom < BoxTop || row.Top > Height) continue;
                // A caption band already edges the row above it, so rows only separate within one section
                var separator = i < rooms.Count - 1 && rooms[i + 1].Kind != RowKind.Header;
                DrawRow(g, rooms[i], row, i == hoverRow, mapLeft, countLeft, pingLeft, separator);
            }
            g.ResetClip();
        }

        void DrawRow(Graphics g, RoomRow room, Rectangle row, bool hot, int mapLeft, int countLeft, int pingLeft, bool separator)
        {
            var s = DpiScale;
            const TextFormatFlags line = TextFormatFlags.NoPadding | TextFormatFlags.SingleLine | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis;
            if (room.Kind == RowKind.Header)
            {
                // A darker band bounds the caption on both sides, so it never reads as part of the row below
                using (var brush = new SolidBrush(Theme.Background)) g.FillRectangle(brush, row);
                using (var font = new Font(Theme.FontName, 8.25f, FontStyle.Bold))
                {
                    TextRenderer.DrawText(g, room.Text, font, new Rectangle(row.X + (int)(12 * s), row.Y, row.Width - (int)(24 * s), row.Height), Theme.Muted, line | TextFormatFlags.Left);
                }
                return;
            }
            if (room.Kind == RowKind.Empty)
            {
                using (var font = new Font(Theme.FontName, 9f))
                {
                    TextRenderer.DrawText(g, room.Text, font, row, Theme.Faint, line | TextFormatFlags.HorizontalCenter);
                }
                return;
            }

            var own = room.Kind == RowKind.Own;
            var waiting = room.Kind == RowKind.Waiting;
            var faded = waiting && room.Full;
            var back = own ? Theme.ActivePanel : (hot && CanJoin(room) ? Theme.PanelHover : Theme.Panel);
            if (back != Theme.Panel)
            {
                using (var brush = new SolidBrush(back)) g.FillRectangle(brush, row);
            }
            if (separator)
            {
                using (var pen = new Pen(Theme.Border, Math.Max(1f, s))) g.DrawLine(pen, row.X + 8 * s, row.Bottom - 0.5f, row.Right - 8 * s, row.Bottom - 0.5f);
            }

            var avatarsRight = DrawAvatars(g, room, row, back, mapLeft - (int)(8 * s), faded);
            using (var nameFont = new Font(Theme.FontName, 9.75f))
            using (var small = new Font(Theme.FontName, 9f))
            {
                var nameLeft = avatarsRight + (int)(10 * s);
                var nameRect = new Rectangle(nameLeft, row.Y, mapLeft - nameLeft - (int)(8 * s), row.Height);
                if (own) DrawTag(g, Strings.YourRoom, nameRect);
                else if (waiting)
                {
                    var name = string.IsNullOrEmpty(room.Name) ? Strings.Player : room.Name;
                    TextRenderer.DrawText(g, name, nameFont, nameRect, Fade(Theme.Text, faded), line | TextFormatFlags.Left);
                }

                var map = room.Friends ? Strings.FriendGame : MapName(room.Map);
                TextRenderer.DrawText(g, map, small, new Rectangle(mapLeft, row.Y, countLeft - mapLeft, row.Height), Fade(Theme.Muted, faded), line | TextFormatFlags.Left);
                var count = waiting || (own && room.Minutes < 0)
                    ? (room.MaxPlayers > 0 ? room.Players + "/" + room.MaxPlayers : room.Players.ToString())
                    : string.Format(Strings.RoomPlayers, room.Players);
                TextRenderer.DrawText(g, count, small, new Rectangle(countLeft, row.Y, pingLeft - countLeft - (int)(6 * s), row.Height), faded ? Theme.Error : Theme.Muted, line | TextFormatFlags.Right);

                if (!waiting)
                {
                    var right = new Rectangle(pingLeft - (int)(10 * s), row.Y, row.Right - (int)(12 * s) - (pingLeft - (int)(10 * s)), row.Height);
                    var text = room.Minutes >= 0 ? string.Format(Strings.PlayingFor, room.Minutes) : (own ? Strings.WaitingForPlayers : "");
                    TextRenderer.DrawText(g, text, small, right, Theme.Muted, line | TextFormatFlags.Right);
                    return;
                }
                if (LookOnly)
                {
                    TextRenderer.DrawText(g, "—", small, PingRect(row), Theme.Faint, line | TextFormatFlags.HorizontalCenter);
                }
            }

            if (!LookOnly)
            {
                var ping = PingRect(row);
                var center = new PointF(ping.X + ping.Width / 2f, ping.Y + ping.Height / 2f);
                if (room.Probe == ProbeState.Testing) DrawSpinner(g, center, s);
                else DrawSignal(g, center, s, room);
            }

            var button = ButtonRect(row);
            var usable = CanJoin(room);
            using (var path = Theme.Rounded(button, 6 * s))
            using (var brush = new SolidBrush(usable ? (hot && hoverButton ? Theme.AccentHover : Theme.Accent) : Theme.PanelHover))
            {
                g.FillPath(brush, path);
            }
            using (var bold = new Font(Theme.FontName, 9f, FontStyle.Bold))
            {
                TextRenderer.DrawText(g, room.Full ? Strings.Full : Strings.Join, bold, button, usable ? Color.White : Theme.Faint,
                    TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
            }
        }

        // Overlapping circles, each ringed in the row colour so the one behind shows a clean edge; returns where they end
        int DrawAvatars(Graphics g, RoomRow room, Rectangle row, Color back, int limit, bool faded)
        {
            var s = DpiScale;
            var d = 26 * s;
            var left = 12 * s;
            var count = room.Friends ? Math.Max(1, room.Players) : Math.Max(1, room.Avatars.Count);
            var step = count > 1 ? Math.Min(19 * s, (limit - left - d) / (count - 1)) : 0;
            var top = row.Y + (row.Height - d) / 2;
            for (var i = 0; i < count; i++)
            {
                var rect = new RectangleF(left + i * step, top, d, d);
                using (var ring = new SolidBrush(back)) g.FillEllipse(ring, RectangleF.Inflate(rect, 2 * s, 2 * s));
                if (room.Friends) DrawFigure(g, rect, s);
                else
                {
                    var avatar = i < room.Avatars.Count ? room.Avatars[i] : null;
                    var name = avatar == null || string.IsNullOrEmpty(avatar.Name) ? Strings.Player : avatar.Name;
                    AvatarPainter.Draw(g, rect, avatar == null ? null : avatar.Url, name, name.GetHashCode(), faded ? 115 : 255);
                }
            }
            return (int)(left + (count - 1) * step + d);
        }

        // A friends game hides who is playing, so each player is a plain head and shoulders
        static void DrawFigure(Graphics g, RectangleF rect, float s)
        {
            using (var brush = new SolidBrush(ColorTranslator.FromHtml("#4a3f37"))) g.FillEllipse(brush, rect);
            var cx = rect.X + rect.Width / 2;
            var cy = rect.Y + rect.Height / 2;
            using (var pen = new Pen(Theme.Muted, 1.6f * s))
            {
                g.DrawEllipse(pen, cx - 3.5f * s, cy - 6.5f * s, 7 * s, 7 * s);
                g.DrawArc(pen, cx - 6.5f * s, cy + 1.5f * s, 13 * s, 10 * s, 200, 140);
            }
        }

        static void DrawTag(Graphics g, string text, Rectangle area)
        {
            using (var font = new Font(Theme.FontName, 8.25f, FontStyle.Bold))
            {
                var size = TextRenderer.MeasureText(text, font);
                var h = font.Height + 4;
                var pill = new Rectangle(area.X, area.Y + (area.Height - h) / 2, Math.Min(area.Width, size.Width + 12), h);
                using (var path = Theme.Rounded(pill, h / 2f))
                using (var brush = new SolidBrush(Theme.Accent))
                {
                    g.FillPath(brush, path);
                }
                TextRenderer.DrawText(g, text, font, pill, Color.White,
                    TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding | TextFormatFlags.SingleLine | TextFormatFlags.EndEllipsis);
            }
        }

        void DrawSpinner(Graphics g, PointF center, float s)
        {
            var r = 6 * s;
            var rect = new RectangleF(center.X - r, center.Y - r, 2 * r, 2 * r);
            using (var track = new Pen(Theme.Border, 2 * s)) g.DrawEllipse(track, rect);
            using (var arc = new Pen(Theme.Muted, 2 * s) { StartCap = LineCap.Round, EndCap = LineCap.Round }) g.DrawArc(arc, rect, spin - 90, 90);
        }

        // Three bars like a phone's signal: more lit bars mean a lower latency
        static void DrawSignal(Graphics g, PointF center, float s, RoomRow room)
        {
            var lit = 0;
            var color = Theme.Border;
            var latency = room.Latency;
            if (latency >= 0)
            {
                if (latency < 60) { lit = 3; color = Theme.Ok; }
                else if (latency <= 120) { lit = 2; color = Theme.Warning; }
                else { lit = 1; color = Theme.Error; }
            }
            var left = center.X - 9 * s;
            var top = center.Y - 7 * s;
            float[] heights = { 4, 8, 12 };
            for (var i = 0; i < 3; i++)
            {
                var bar = new RectangleF(left + (1 + i * 6) * s, top + (13 - heights[i]) * s, 3 * s, heights[i] * s);
                using (var path = Theme.Rounded(bar, Math.Min(1 * s, bar.Width / 2)))
                using (var brush = new SolidBrush(i < lit ? color : Theme.Border))
                {
                    g.FillPath(brush, path);
                }
            }
            if (room.Probe == ProbeState.Unreachable && latency < 0)
            {
                using (var pen = new Pen(Theme.Error, 2 * s) { StartCap = LineCap.Round, EndCap = LineCap.Round })
                {
                    g.DrawLine(pen, left + 2 * s, top + 1.5f * s, left + 16 * s, top + 12.5f * s);
                }
            }
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                timer.Dispose();
                tip.Dispose();
            }
            base.Dispose(disposing);
        }
    }

    // The stock menu renders light grey, which looks broken on the dark window
    class DarkMenuColors : ProfessionalColorTable
    {
        public override Color ToolStripDropDownBackground { get { return Theme.Panel; } }
        public override Color MenuBorder { get { return Theme.Border; } }
        public override Color MenuItemBorder { get { return Theme.Border; } }
        public override Color MenuItemSelected { get { return Theme.PanelHover; } }
        public override Color ImageMarginGradientBegin { get { return Theme.Panel; } }
        public override Color ImageMarginGradientMiddle { get { return Theme.Panel; } }
        public override Color ImageMarginGradientEnd { get { return Theme.Panel; } }
        public override Color CheckBackground { get { return Theme.ActivePanel; } }
        public override Color CheckSelectedBackground { get { return Theme.ActivePanel; } }
        public override Color CheckPressedBackground { get { return Theme.ActivePanel; } }
    }

    class FlatButton : Button
    {
        public FlatButton()
        {
            FlatStyle = FlatStyle.Flat;
            Cursor = Cursors.Hand;
            UseVisualStyleBackColor = false;
            MakePlain();
        }

        public void MakePlain()
        {
            BackColor = Theme.Background;
            ForeColor = Theme.Text;
            Font = new Font(Theme.FontName, 9f);
            BorderColor = Theme.Border;
            FlatAppearance.MouseOverBackColor = Theme.PanelHover;
            FlatAppearance.MouseDownBackColor = Theme.Panel;
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
