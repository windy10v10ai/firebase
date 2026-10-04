using Microsoft.Win32;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace Windy10v10AI.Launcher
{
    // What the player saw go wrong; goes along with the report but is never shown in the dialog
    class FeedbackError
    {
        public string Message;
        public string Stage;
        public string Detail;
    }

    class FeedbackContext
    {
        public string LauncherVersion;
        public string MapVersion;
        // Index of the mode bar: 0 solo, 1 host, 2 join
        public int Mode;
        public string GameDir;
        public FeedbackError Error;
    }

    class FeedbackDraft
    {
        public string Type;
        public List<string> Topics = new List<string>();
        public string Description;
        public bool AttachLogs;
        public FeedbackContext Context;
    }

    enum FeedbackResult { Sent, Failed, TooManyReports, DailyLimit }

    // Sends one report to the feedback endpoint, going through the same routes as the room API
    static class FeedbackApi
    {
        const int DirectTimeout = 10000;
        // Covers a cold start of the proxy and the backend behind it
        const int RelayTimeout = 20000;
        const int MaxLogBytes = 1024 * 1024;
        // The newest part of a log is what explains a failure, so only the tail is read
        const long TailBytes = 20L * 1024 * 1024;
        const long SmallTailBytes = 5L * 1024 * 1024;
        static readonly string[] Modes = { "solo", "host", "join" };

        static FeedbackApi()
        {
            ServicePointManager.SecurityProtocol |= (SecurityProtocolType)3072;
        }

        public static FeedbackResult Send(FeedbackDraft draft)
        {
            var serializer = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
            var json = serializer.Serialize(BuildBody(draft));
            // For local testing against an API on this machine
            var local = Environment.GetEnvironmentVariable("WINDY_API");
            var routes = string.IsNullOrEmpty(local)
                ? new[] { Root(Updater.DirectApi), Root(Updater.RelayApi) }
                : new[] { local.TrimEnd('/') + "/api/" };
            for (var i = 0; i < routes.Length; i++)
            {
                try
                {
                    Post(routes[i] + "feedback", json, i == 0 ? DirectTimeout : RelayTimeout);
                    return FeedbackResult.Sent;
                }
                catch (WebException error)
                {
                    var response = error.Response as HttpWebResponse;
                    // The API answered, so another route would get the same answer
                    if (response != null) return Classify(response);
                }
            }
            return FeedbackResult.Failed;
        }

        // The launcher API prefixes are shared with the room endpoints; the feedback endpoint sits beside them
        static string Root(string api)
        {
            return api.Substring(0, api.Length - "launcher/".Length);
        }

        public static Dictionary<string, object> BuildBody(FeedbackDraft draft)
        {
            var context = draft.Context;
            var body = new Dictionary<string, object>
            {
                { "type", draft.Type },
                { "topics", draft.Topics.ToArray() },
                { "launcherVersion", context.LauncherVersion },
                { "windowsVersion", WindowsVersion() },
            };
            var description = (draft.Description ?? "").Trim();
            if (description.Length > 0) body["description"] = description;
            var steamId = Net.SteamAccountId();
            if (steamId > 0) body["steamId"] = steamId;
            if (!string.IsNullOrEmpty(context.MapVersion)) body["mapVersion"] = context.MapVersion;
            if (context.Mode >= 0 && context.Mode < Modes.Length) body["mode"] = Modes[context.Mode];
            var error = context.Error;
            if (error != null)
            {
                var detail = new Dictionary<string, object> { { "message", Clip(error.Message, 1000) } };
                if (!string.IsNullOrEmpty(error.Stage)) detail["stage"] = Clip(error.Stage, 50);
                if (!string.IsNullOrEmpty(error.Detail)) detail["detail"] = Clip(error.Detail, 4000);
                body["launcherError"] = detail;
            }
            if (draft.AttachLogs && !string.IsNullOrEmpty(context.GameDir))
            {
                var server = PackLog(Path.Combine(context.GameDir, @"dota\dedicated.log"));
                if (server != null) body["serverLog"] = server;
                var client = PackLog(Path.Combine(context.GameDir, @"dota\client.log"));
                if (client != null) body["clientLog"] = client;
            }
            return body;
        }

        // Without a supportedOS manifest entry Environment.OSVersion reports every newer Windows as 6.2
        static string WindowsVersion()
        {
            try
            {
                const string key = @"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion";
                var build = Registry.GetValue(key, "CurrentBuild", null) as string;
                if (!string.IsNullOrEmpty(build))
                {
                    var ubr = Registry.GetValue(key, "UBR", null);
                    var display = Registry.GetValue(key, "DisplayVersion", null) as string;
                    return "10.0." + build + (ubr == null ? "" : "." + ubr) + (string.IsNullOrEmpty(display) ? "" : " " + display);
                }
            }
            catch (Exception)
            {
            }
            return Environment.OSVersion.VersionString;
        }

        static string Clip(string text, int max)
        {
            text = text ?? "";
            return text.Length <= max ? text : text.Substring(0, max);
        }

        // Returns the gzipped, base64 encoded tail of the log, or null when it is missing, unreadable or still too big
        public static string PackLog(string path)
        {
            try
            {
                if (!File.Exists(path)) return null;
                foreach (var tail in new[] { TailBytes, SmallTailBytes })
                {
                    var packed = Compress(Anonymize(ReadTail(path, tail)));
                    if (packed.Length <= MaxLogBytes) return Convert.ToBase64String(packed);
                }
            }
            catch (Exception)
            {
                // A log that cannot be read is simply left out of the report
            }
            return null;
        }

        static string ReadTail(string path, long bytes)
        {
            // The game keeps writing the log while it runs
            using (var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
            {
                var start = Math.Max(0, stream.Length - bytes);
                stream.Seek(start, SeekOrigin.Begin);
                var buffer = new byte[stream.Length - start];
                var read = 0;
                while (read < buffer.Length)
                {
                    var n = stream.Read(buffer, read, buffer.Length - read);
                    if (n <= 0) break;
                    read += n;
                }
                return Encoding.UTF8.GetString(buffer, 0, read);
            }
        }

        // Paths in the log carry the Windows account name, which the report has no use for
        static string Anonymize(string text)
        {
            text = Regex.Replace(text, @"(?i)([a-z]:[\\/]+users[\\/]+)[^\\/\r\n""']+", "$1<user>");
            var name = Environment.UserName;
            if (!string.IsNullOrEmpty(name))
            {
                text = Regex.Replace(text, @"(?<=[\\/])" + Regex.Escape(name) + @"(?=[\\/])", "<user>", RegexOptions.IgnoreCase);
            }
            return text;
        }

        static byte[] Compress(string text)
        {
            var bytes = Encoding.UTF8.GetBytes(text);
            using (var output = new MemoryStream())
            {
                using (var gzip = new GZipStream(output, CompressionMode.Compress, true)) gzip.Write(bytes, 0, bytes.Length);
                return output.ToArray();
            }
        }

        static void Post(string url, string json, int timeout)
        {
            var request = (HttpWebRequest)WebRequest.Create(url);
            request.Method = "POST";
            request.ContentType = "application/json";
            request.Timeout = timeout;
            request.ReadWriteTimeout = timeout;
            var bytes = Encoding.UTF8.GetBytes(json);
            using (var stream = request.GetRequestStream()) stream.Write(bytes, 0, bytes.Length);
            // A successful report answers 204 with no body, so there is nothing to read
            using (request.GetResponse())
            {
            }
        }

        static FeedbackResult Classify(HttpWebResponse response)
        {
            if ((int)response.StatusCode != 429) return FeedbackResult.Failed;
            try
            {
                using (var reader = new StreamReader(response.GetResponseStream(), Encoding.UTF8))
                {
                    var body = reader.ReadToEnd();
                    if (body.Contains("too_many_reports")) return FeedbackResult.TooManyReports;
                    if (body.Contains("daily_limit_reached")) return FeedbackResult.DailyLimit;
                }
            }
            catch (Exception)
            {
                // An unreadable body falls back to the generic failure
            }
            return FeedbackResult.Failed;
        }
    }

    // Pill button with a speech bubble that opens the feedback dialog from the main window
    class FeedbackButton : PaintedControl
    {
        bool hover;

        public FeedbackButton()
        {
            Cursor = Cursors.Hand;
            TabStop = true;
            Font = new Font(Theme.FontName, 8.25f);
        }

        public int PreferredWidth
        {
            get { return TextRenderer.MeasureText(Text, Font).Width + (int)(38 * DpiScale); }
        }

        protected override void OnMouseEnter(EventArgs e) { hover = true; Invalidate(); base.OnMouseEnter(e); }
        protected override void OnMouseLeave(EventArgs e) { hover = false; Invalidate(); base.OnMouseLeave(e); }

        protected override void OnKeyDown(KeyEventArgs e)
        {
            if (e.KeyCode == Keys.Space || e.KeyCode == Keys.Enter) OnClick(EventArgs.Empty);
            base.OnKeyDown(e);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = Prepare(e);
            var s = DpiScale;
            var rect = new RectangleF(0.5f, 0.5f, Width - 1.5f, Height - 1.5f);
            using (var path = Theme.Rounded(rect, rect.Height / 2))
            using (var brush = new SolidBrush(hover ? Theme.PanelHover : Theme.Panel))
            using (var pen = new Pen(Theme.Border, Math.Max(1f, s)))
            {
                g.FillPath(brush, path);
                g.DrawPath(pen, path);
            }
            var left = 11 * s;
            var top = (Height - 10 * s) / 2 - 1.5f * s;
            using (var pen = new Pen(Theme.Text, 1.5f * s) { LineJoin = System.Drawing.Drawing2D.LineJoin.Round })
            {
                var body = new RectangleF(left, top, 12 * s, 9 * s);
                using (var path = Theme.Rounded(body, 2 * s)) g.DrawPath(pen, path);
                g.DrawLines(pen, new[]
                {
                    new PointF(left + 2.5f * s, top + 9 * s),
                    new PointF(left + 1.5f * s, top + 12 * s),
                    new PointF(left + 5.5f * s, top + 9 * s),
                });
            }
            var textLeft = (int)(29 * s);
            TextRenderer.DrawText(g, Text, Font, new Rectangle(textLeft, 0, Width - textLeft, Height), Theme.Text,
                TextFormatFlags.VerticalCenter | TextFormatFlags.Left | TextFormatFlags.NoPadding);
        }
    }

    // A toggle that reads as a pill; the dialog decides whether a click is allowed, because it enforces the limit
    class TopicChip : PaintedControl
    {
        bool isChecked;
        bool hover;
        public bool Dimmed;
        public event EventHandler Toggled;

        public TopicChip()
        {
            Cursor = Cursors.Hand;
            TabStop = true;
            Font = new Font(Theme.FontName, 9f);
        }

        public bool Checked
        {
            get { return isChecked; }
            set
            {
                if (isChecked == value) return;
                isChecked = value;
                Invalidate();
            }
        }

        public int PreferredWidth
        {
            get { return TextRenderer.MeasureText(Text, Font).Width + (int)(24 * DpiScale); }
        }

        protected override void OnMouseEnter(EventArgs e) { hover = true; Invalidate(); base.OnMouseEnter(e); }
        protected override void OnMouseLeave(EventArgs e) { hover = false; Invalidate(); base.OnMouseLeave(e); }

        protected override void OnClick(EventArgs e)
        {
            if (Enabled && Toggled != null) Toggled(this, EventArgs.Empty);
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
            var rect = new RectangleF(0.5f, 0.5f, Width - 1.5f, Height - 1.5f);
            var faded = Dimmed && !isChecked;
            using (var path = Theme.Rounded(rect, rect.Height / 2))
            using (var brush = new SolidBrush(isChecked ? Theme.ActivePanel : (hover && !faded && Enabled ? Theme.PanelHover : Theme.Panel)))
            using (var pen = new Pen(isChecked ? Theme.Accent : Theme.Border, Math.Max(1f, s)))
            {
                g.FillPath(brush, path);
                g.DrawPath(pen, path);
            }
            var color = isChecked ? Theme.Text : (faded || !Enabled ? Theme.Faint : Theme.Muted);
            TextRenderer.DrawText(g, Text, Font, ClientRectangle, color,
                TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
        }
    }

    // Modal form owned by the main window; closing it never touches a launch in progress
    class FeedbackDialog : Form
    {
        const int MaxTopics = 2;
        const int MaxDescription = 1000;
        const string PrivacyUrl = Updater.DownloadPage + "/code-signing#privacy";
        static readonly string[] TopicIds = { "hero", "ability", "item", "bot", "balance", "ui", "member", "lag", "launcher", "web" };

        readonly FeedbackContext context;
        readonly SegmentedBar typeBar = new SegmentedBar();
        readonly TopicChip[] chips = new TopicChip[TopicIds.Length];
        readonly Label descriptionLabel = new Label();
        readonly Label required = new Label();
        readonly TextBox description = new TextBox();
        readonly Label cue = new Label();
        readonly ToggleBox attach = new ToggleBox();
        readonly Label failure = new Label();
        readonly FlatButton cancel = new FlatButton();
        readonly FlatButton send = new FlatButton();
        bool sending;

        public FeedbackDialog(FeedbackContext context)
        {
            this.context = context;
            var s = Theme.Dpi / 96f;
            Func<float, int> p = value => (int)Math.Round(value * s);
            Text = Strings.FeedbackTitle;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.CenterParent;
            AutoScaleMode = AutoScaleMode.None;
            BackColor = Theme.Background;
            ForeColor = Theme.Text;
            Font = new Font(Theme.FontName, 9f);

            const int Margin = 20;
            const int Width = 460;
            var y = Margin;

            typeBar.Items = new[] { Strings.TypeProblem, Strings.TypeSuggestion };
            typeBar.SetBounds(p(Margin), p(y), p(Width), p(36));
            y += 48;

            var related = new Label { Text = Strings.RelatedTo, ForeColor = Theme.Text, Font = new Font(Theme.FontName, 9f, FontStyle.Bold), TextAlign = ContentAlignment.MiddleLeft };
            related.SetBounds(p(Margin), p(y), p(Width / 2), p(20));
            var limit = new Label { Text = Strings.UpToTwo, ForeColor = Theme.Muted, Font = new Font(Theme.FontName, 8.25f), TextAlign = ContentAlignment.MiddleRight };
            limit.SetBounds(p(Margin + Width / 2), p(y), p(Width / 2), p(20));
            y += 26;

            var names = Strings.TopicNames;
            var x = 0;
            var rowTop = y;
            for (var i = 0; i < chips.Length; i++)
            {
                var chip = new TopicChip { Text = names[i] };
                var width = chip.PreferredWidth;
                if (x > 0 && x + width > p(Width))
                {
                    x = 0;
                    rowTop += 36;
                }
                chip.SetBounds(p(Margin) + x, p(rowTop), width, p(28));
                x += width + p(8);
                var index = i;
                chip.Toggled += delegate { ToggleTopic(index); };
                chips[i] = chip;
            }
            y = rowTop + 40;

            descriptionLabel.Text = Strings.Description;
            descriptionLabel.ForeColor = Theme.Text;
            descriptionLabel.Font = new Font(Theme.FontName, 9f, FontStyle.Bold);
            descriptionLabel.TextAlign = ContentAlignment.MiddleLeft;
            var labelWidth = TextRenderer.MeasureText(descriptionLabel.Text, descriptionLabel.Font).Width + p(2);
            descriptionLabel.SetBounds(p(Margin), p(y), labelWidth, p(20));
            required.Text = "*";
            required.ForeColor = Theme.Error;
            required.Font = descriptionLabel.Font;
            required.TextAlign = ContentAlignment.MiddleLeft;
            required.SetBounds(p(Margin) + labelWidth, p(y), p(16), p(20));
            y += 24;

            description.Multiline = true;
            description.MaxLength = MaxDescription;
            description.ScrollBars = ScrollBars.Vertical;
            description.BorderStyle = BorderStyle.FixedSingle;
            description.BackColor = Theme.Panel;
            description.ForeColor = Theme.Text;
            description.SetBounds(p(Margin), p(y), p(Width), p(112));
            cue.ForeColor = Theme.Faint;
            cue.BackColor = Theme.Panel;
            cue.SetBounds(p(4), p(3), p(Width - 12), p(36));
            // Cue banners do not work on multiline boxes, so a label inside the box stands in for one
            cue.Click += delegate { description.Focus(); };
            description.Controls.Add(cue);
            description.TextChanged += delegate { UpdateInputs(); };
            y += 124;

            attach.Text = Strings.AttachLog;
            var attachWidth = attach.PreferredWidth + p(2);
            attach.SetBounds(p(Margin), p(y), attachWidth, p(22));
            var attachHint = new Label { Text = Strings.AttachLogHint, ForeColor = Theme.Muted, Font = new Font(Theme.FontName, 8.25f), TextAlign = ContentAlignment.MiddleLeft };
            attachHint.SetBounds(p(Margin) + attachWidth + p(8), p(y), p(Width) - attachWidth - p(8), p(22));
            y += 30;

            failure.ForeColor = Theme.Error;
            failure.TextAlign = ContentAlignment.MiddleLeft;
            failure.Visible = false;
            failure.SetBounds(p(Margin), p(y), p(Width), p(22));
            y += 28;

            cancel.Text = Strings.Cancel;
            cancel.DialogResult = DialogResult.Cancel;
            send.Text = Strings.Send;
            send.MakePrimary();
            var sendWidth = Math.Max(p(96), TextRenderer.MeasureText(Strings.Resend, send.Font).Width + p(28));
            var cancelWidth = Math.Max(p(80), TextRenderer.MeasureText(Strings.Cancel, cancel.Font).Width + p(28));
            send.SetBounds(p(Margin + Width) - sendWidth, p(y), sendWidth, p(32));
            cancel.SetBounds(send.Left - p(8) - cancelWidth, p(y), cancelWidth, p(32));
            var privacy = new LinkLabel
            {
                Text = Strings.PrivacyNote + Strings.PrivacyLink,
                Font = new Font(Theme.FontName, 8.25f),
                ForeColor = Theme.Muted,
                LinkColor = Theme.Muted,
                ActiveLinkColor = Theme.Text,
                LinkBehavior = LinkBehavior.AlwaysUnderline,
                TextAlign = ContentAlignment.MiddleLeft,
            };
            privacy.LinkArea = new LinkArea(Strings.PrivacyNote.Length, Strings.PrivacyLink.Length);
            privacy.LinkClicked += delegate { MainForm.OpenUrl(PrivacyUrl); };
            privacy.SetBounds(p(Margin), p(y), cancel.Left - p(Margin) - p(12), p(32));
            y += 32 + Margin;
            ClientSize = new Size(p(Margin * 2 + Width), p(y));

            Controls.AddRange(new Control[] { typeBar, related, limit, descriptionLabel, required, description, attach, attachHint, failure, privacy, cancel, send });
            Controls.AddRange(chips);
            CancelButton = cancel;

            typeBar.SelectedChanged += delegate
            {
                // Logs help most with problems, so each type starts from its own default
                attach.Checked = typeBar.Selected == 0;
                UpdateInputs();
            };
            send.Click += delegate { Submit(); };
            // A report from the error notice already knows which area it is about
            if (context.Error != null) SelectLauncherTopic();
            attach.Checked = true;
            UpdateInputs();
        }

        void SelectLauncherTopic()
        {
            var index = Array.IndexOf(TopicIds, "launcher");
            chips[index].Checked = true;
            UpdateChips();
        }

        bool Suggesting
        {
            get { return typeBar.Selected == 1; }
        }

        int SelectedCount()
        {
            var count = 0;
            foreach (var chip in chips) if (chip.Checked) count++;
            return count;
        }

        void ToggleTopic(int index)
        {
            if (sending) return;
            var chip = chips[index];
            if (!chip.Checked && SelectedCount() >= MaxTopics) return;
            chip.Checked = !chip.Checked;
            UpdateChips();
        }

        void UpdateChips()
        {
            var full = SelectedCount() >= MaxTopics;
            foreach (var chip in chips)
            {
                chip.Dimmed = full;
                chip.Invalidate();
            }
        }

        void UpdateInputs()
        {
            required.Visible = Suggesting;
            cue.Text = Suggesting ? Strings.SuggestionCue : Strings.ProblemCue;
            cue.Visible = description.Text.Length == 0;
            var ready = !sending && (!Suggesting || description.Text.Trim().Length > 0);
            send.Enabled = ready;
            if (ready)
            {
                send.MakePrimary();
            }
            else
            {
                send.BackColor = Theme.PanelHover;
                send.BorderColor = Theme.PanelHover;
                send.ForeColor = Theme.Faint;
            }
        }

        void Submit()
        {
            var draft = new FeedbackDraft
            {
                Type = Suggesting ? "suggestion" : "problem",
                Description = description.Text,
                AttachLogs = attach.Checked,
                Context = context,
            };
            for (var i = 0; i < chips.Length; i++) if (chips[i].Checked) draft.Topics.Add(TopicIds[i]);
            SetSending(true);
            new Thread(() =>
            {
                var result = FeedbackApi.Send(draft);
                try
                {
                    BeginInvoke((Action)(() => Finished(result)));
                }
                catch (InvalidOperationException)
                {
                    // The window was disposed before the answer arrived
                }
            }) { IsBackground = true }.Start();
        }

        void SetSending(bool value)
        {
            sending = value;
            failure.Visible = false;
            foreach (Control control in new Control[] { typeBar, description, attach, cancel })
            {
                control.Enabled = !value;
            }
            foreach (var chip in chips) chip.Enabled = !value;
            send.Text = value ? Strings.Sending : Strings.Send;
            UpdateInputs();
        }

        void Finished(FeedbackResult result)
        {
            if (result == FeedbackResult.Sent)
            {
                sending = false;
                DialogResult = DialogResult.OK;
                return;
            }
            SetSending(false);
            failure.Text = result == FeedbackResult.TooManyReports ? Strings.FeedbackTooMany
                : result == FeedbackResult.DailyLimit ? Strings.FeedbackDailyLimit
                : Strings.FeedbackFailed;
            failure.Visible = true;
            send.Text = Strings.Resend;
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            // The report is already on its way; closing now would hide whether it arrived
            if (sending) e.Cancel = true;
            base.OnFormClosing(e);
        }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            Theme.UseDarkTitleBar(Handle);
        }
    }
}
