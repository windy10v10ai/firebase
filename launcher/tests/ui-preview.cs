using System;
using System.Collections;
using System.Collections.Generic;
using System.ComponentModel;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Runtime.Serialization;
using System.Threading;
using System.Windows.Forms;

namespace Windy10v10AI.Launcher.Tests
{
    static class UiPreview
    {
        const BindingFlags Members = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static;
        static Assembly launcher;
        static Type mainType;
        static Form main;
        static string output;
        static int assertions;
        static int screenshots;

        [DllImport("user32.dll")]
        static extern bool ShowWindow(IntPtr window, int command);
        [DllImport("user32.dll")]
        static extern bool PrintWindow(IntPtr window, IntPtr dc, uint flags);
        [DllImport("user32.dll")]
        static extern bool RedrawWindow(IntPtr window, IntPtr rectangle, IntPtr region, uint flags);
        [DllImport("user32.dll")]
        static extern int GetWindowLong(IntPtr window, int index);
        [DllImport("user32.dll")]
        static extern int SetWindowLong(IntPtr window, int index, int value);
        [DllImport("dwmapi.dll")]
        static extern int DwmFlush();

        static Type Type(string name)
        {
            return launcher.GetType("Windy10v10AI.Launcher." + name, true);
        }

        static object Get(object target, string field)
        {
            return target.GetType().GetField(field, Members).GetValue(target);
        }

        static void Set(object target, string field, object value)
        {
            target.GetType().GetField(field, Members).SetValue(target, value);
        }

        static object Call(object target, string method, params object[] arguments)
        {
            MethodInfo match = null;
            foreach (var candidate in target.GetType().GetMethods(Members))
            {
                if (candidate.Name != method || candidate.GetParameters().Length != arguments.Length) continue;
                if (match != null) throw new AmbiguousMatchException(method);
                match = candidate;
            }
            if (match == null) throw new MissingMethodException(target.GetType().FullName, method);
            return match.Invoke(target, arguments);
        }

        static void Setting(string name, object value)
        {
            Type("Settings").GetField(name, Members).SetValue(null, value);
        }

        static string Text(string key)
        {
            return (string)Type("Strings").GetProperty(key, Members).GetValue(null, null);
        }

        static Control Control(string name)
        {
            return (Control)Get(main, name);
        }

        static void Assert(bool success, string message)
        {
            if (!success) throw new InvalidOperationException(message);
            assertions++;
            Console.WriteLine("PASS " + message);
        }

        static void StopTimers(Control control)
        {
            foreach (var field in control.GetType().GetFields(Members))
            {
                if (field.FieldType == typeof(System.Windows.Forms.Timer))
                {
                    var timer = (System.Windows.Forms.Timer)field.GetValue(control);
                    if (timer != null) timer.Stop();
                }
            }
            foreach (Control child in control.Controls) StopTimers(child);
        }

        static void Layout()
        {
            Call(main, "Relayout");
            StopTimers(main);
            Application.DoEvents();
        }

        static void FormEvent(Form form, string name, bool keepFirst)
        {
            var events = (EventHandlerList)typeof(Component).GetProperty("Events", Members).GetValue(form, null);
            var key = typeof(Form).GetField(name, Members).GetValue(null);
            var handlers = events[key];
            if (handlers == null) return;
            events.RemoveHandler(key, handlers);
            if (keepFirst) events.AddHandler(key, handlers.GetInvocationList()[0]);
        }

        static void ShowOffscreen(Form form)
        {
            form.StartPosition = FormStartPosition.Manual;
            form.Location = new Point(-10000, -10000);
            var window = form.Handle;
            SetWindowLong(window, -20, GetWindowLong(window, -20) | 0x08000000);
            form.Show();
            ShowWindow(window, 4);
            StopTimers(form);
            Application.DoEvents();
        }

        static void PrepareWorkshop()
        {
            var attempts = (IDictionary)Type("WorkshopLatest").GetField("attempts", Members).GetValue(null);
            attempts["2307479570"] = DateTime.UtcNow;
            attempts["2636824668"] = DateTime.UtcNow;
        }

        static void NewMain(int mode, bool busy)
        {
            DisposeMain();
            main = (Form)Activator.CreateInstance(mainType, true);
            StopTimers(main);
            Set(Control("modeBar"), "SelectedChanged", null);
            Set(Control("autoStartBox"), "CheckedChanged", null);
            Set(Control("autoEnterBox"), "CheckedChanged", null);
            Set(Control("modeBar"), "selected", mode);
            Setting("Mode", mode);
            Setting("PublicRoom", true);
            Setting("MaxPlayers", 10);
            Set(Control("roomTypeBar"), "selected", 0);
            Call(main, "UpdateMaxButton");
            Setting("AutoStartDota", true);
            Setting("AutoEnter", true);
            Set(Control("autoStartBox"), "isChecked", true);
            Set(Control("autoEnterBox"), "isChecked", true);
            Set(main, "busy", busy);
            Set(main, "cardShown", false);
            Set(main, "badgeLoading", 1);
            Control("notice").Visible = false;
            var success = Enum.Parse(Type("NoticeKind"), "Success");
            Call(Control("hostGuide"), "Show", success, Text("HostGuide"), null);
            FormEvent(main, "EVENT_ACTIVATED", false);
            // 首显检查需要真实布局回调，外部请求和设置写入会污染预览。
            FormEvent(main, "EVENT_SHOWN", true);
            ShowOffscreen(main);
            Call(main, "SetFooter", Color.FromArgb(63, 182, 122), Text("MapReady"));
        }

        static void DisposeMain()
        {
            if (main == null) return;
            Set(main, "hostRoom", null);
            Set(main, "joinedRoom", null);
            main.Dispose();
            main = null;
        }

        static void Capture(Form form, string name)
        {
            StopTimers(form);
            form.Invalidate(true);
            form.Refresh();
            RedrawWindow(form.Handle, IntPtr.Zero, IntPtr.Zero, 0x0585);
            Application.DoEvents();
            Thread.Sleep(150);
            DwmFlush();
            var path = Path.Combine(output, name + ".png");
            using (var bitmap = new Bitmap(form.Width, form.Height))
            {
                bool rendered;
                using (var graphics = Graphics.FromImage(bitmap))
                {
                    var dc = graphics.GetHdc();
                    try { rendered = PrintWindow(form.Handle, dc, 2); }
                    finally { graphics.ReleaseHdc(dc); }
                }
                bitmap.Save(path);
                Assert(rendered, name + " PrintWindow");
                var first = bitmap.GetPixel(0, 0).ToArgb();
                var varied = false;
                for (var y = 0; y < bitmap.Height && !varied; y += 13)
                    for (var x = 0; x < bitmap.Width && !varied; x += 13)
                        varied = bitmap.GetPixel(x, y).ToArgb() != first;
                Assert(varied, name + " rendered pixels");
            }
            screenshots++;
            Console.WriteLine("SCREENSHOT " + path);
        }

        static void Toggle(string name, string setting, bool value)
        {
            Set(Control(name), "isChecked", value);
            Setting(setting, value);
            Control(name).Invalidate();
        }

        static void CheckHost(bool visible, string state)
        {
            var option = Control("autoStartBox");
            Assert(option.Visible == visible, state + " host option visibility");
            Assert(!Control("autoEnterBox").Visible, state + " hides join option");
            if (!visible) return;
            Assert(option.Enabled && option.Width > 0, state + " host option usable");
            Assert(option.Right < main.ClientSize.Width, state + " option fits window");
            Assert(option.Bottom < Control("hostGuide").Top, state + " option clears guidance");
            Assert(Control("hostGuide").Bottom < Control("divider").Top, state + " guidance clears footer");
        }

        static void CheckJoin(bool visible, string state)
        {
            var option = Control("autoEnterBox");
            Assert(option.Visible == visible, state + " join option visibility");
            Assert(!Control("autoStartBox").Visible, state + " hides host option");
            if (!visible) return;
            Assert(option.Enabled, state + " join option usable");
            var width = (int)option.GetType().GetProperty("PreferredWidth").GetValue(option, null);
            Assert(option.Width >= width && option.Right < main.ClientSize.Width, state + " full checkbox text");
            Assert(option.Bottom < Control("action").Top, state + " checkbox above actions");
            Assert(Control("action").Bottom < Control("divider").Top, state + " actions above footer");
            if (Control("secondary").Visible)
                Assert(Control("secondary").Right < Control("action").Left, state + " action buttons do not overlap");
        }

        static object Install()
        {
            return Activator.CreateInstance(Type("DotaInstall"), Members, null, new object[] { Path.Combine(output, "absent-steam") }, null);
        }

        static object Presence(string state)
        {
            return Enum.Parse(mainType.GetNestedType("Presence", Members), state);
        }

        static void Players(bool host, bool inGame)
        {
            var entryType = Type("RosterEntry");
            var list = (IList)Activator.CreateInstance(typeof(List<>).MakeGenericType(entryType));
            for (var index = 0; index < 2; index++)
            {
                var entry = Activator.CreateInstance(entryType);
                Set(entry, "SteamId", (long)(index + 1));
                Set(entry, "Key", index == 0 ? "host" : "guest");
                Set(entry, "Name", index == 0 ? "Windy Host" : "Guest Player");
                Set(entry, "IsHost", index == 0);
                Set(entry, "Status", Enum.Parse(Type("PlayerStatus"), inGame ? "InGame" : "InRoom"));
                list.Add(entry);
            }
            Set(main, "selfId", host ? 1L : 2L);
            Call(Control("players"), "SetPlayers", list, host ? 1L : 2L, null);
        }

        static void HostScenes()
        {
            NewMain(1, false);
            CheckHost(true, "host first show");
            Assert((bool)Get(Control("autoStartBox"), "isChecked"), "host initially checked");
            var option = Control("autoStartBox").Bounds;
            var guide = Control("hostGuide").Bounds;
            var size = main.Size;
            Capture(main, "host-create-checked");
            Set(Control("modeBar"), "selected", 0);
            Layout();
            Set(Control("modeBar"), "selected", 1);
            Layout();
            Assert(option == Control("autoStartBox").Bounds && guide == Control("hostGuide").Bounds && size == main.Size,
                "host first show matches switching tabs");
            Toggle("autoStartBox", "AutoStartDota", false);
            Call(Control("hostGuide"), "Show", Enum.Parse(Type("NoticeKind"), "Success"), Text("HostGuideServerOnly"), null);
            Assert(((Control)Get(Control("hostGuide"), "Message")).Text == Text("HostGuideServerOnly"), "unchecked host guidance");
            CheckHost(true, "host unchecked");
            Capture(main, "host-create-off");

            Set(main, "busy", true);
            Set(main, "playersShown", true);
            Set(main, "hostingReady", true);
            var room = FormatterServices.GetUninitializedObject(Type("HostRoomSession"));
            Set(room, "Roster", Activator.CreateInstance(Type("HostRoster"), true));
            Set(main, "hostRoom", room);
            Control("hostCode").GetType().GetProperty("Code").SetValue(Control("hostCode"), "EC5CQP", null);
            Control("hostCode").Visible = true;
            Call(main, "SetIdleControlsEnabled", false);
            Call(main, "ShowProgress", Text("RoomCode"), Text("PublicHostingHint"), Text("CloseRoom"), false);
            Call(main, "ShowHostPresence", Presence("Out"), false, Install(), -1);
            Players(true, false);
            Layout();
            CheckHost(false, "host ready");
            Assert(Control("secondary").Visible && Control("secondary").Text == Text("EnterGame"), "server only offers manual entry");
            Capture(main, "host-ready");
            Call(main, "ShowHostPresence", Presence("InGame"), false, Install(), -1);
            Players(true, true);
            Layout();
            CheckHost(false, "host playing");
            Capture(main, "host-playing");
            Call(main, "ShowRoomEnd", true);
            Players(true, false);
            Layout();
            CheckHost(false, "host ended");
            Assert((bool)Get(main, "pickingNext"), "ended host can pick next game");
            Capture(main, "host-ended");
        }

        static void JoinScenes()
        {
            NewMain(2, true);
            Call(main, "ShowProgress", Text("Connecting"), Text("ConnectingHint"), Text("Cancel"), true);
            Layout();
            CheckJoin(false, "join handshake");
            Capture(main, "join-connecting");
            Set(main, "playersShown", true);
            var title = string.Format(Text("Joined"), "EC5CQP");
            Rectangle? stableOption = null;
            Size? stableSize = null;
            foreach (var state in new[] { "waiting", "ready", "playing", "ended" })
            {
                foreach (var enabled in new[] { true, false })
                {
                    Toggle("autoEnterBox", "AutoEnter", enabled);
                    if (state == "ready") Call(main, "ShowJoinNewGame", title, Install());
                    else if (state == "playing") Call(main, "ShowPresence", Presence("InGame"), title, Text("LeaveRoom"), Install(), -1);
                    else if (state == "ended") Call(main, "ShowJoinEnded", title);
                    else Call(main, "ShowProgress", title, Text("Connecting"), Text("LeaveRoom"), true);
                    Players(false, state == "playing");
                    Layout();
                    var name = "join-" + state + (enabled ? "-checked" : "-off");
                    CheckJoin(true, name);
                    Assert((bool)Get(Control("autoEnterBox"), "isChecked") == enabled, name + " checkbox value");
                    if (stableOption == null) { stableOption = Control("autoEnterBox").Bounds; stableSize = main.Size; }
                    Assert(stableOption.Value == Control("autoEnterBox").Bounds && stableSize.Value == main.Size, name + " stable layout");
                    Capture(main, name);
                }
            }
            Call(main, "ShowPresence", Presence("Stuck"), title, Text("LeaveRoom"), Install(), -1);
            Layout();
            CheckJoin(true, "join error");
            Capture(main, "join-error");
            Set(main, "busy", false);
            Set(main, "playersShown", false);
            Control("secondary").Visible = false;
            Control("action").Visible = false;
            Control("hint").Visible = false;
            Control("marquee").Visible = false;
            Control("notice").Visible = false;
            Control("status").Text = "";
            Layout();
            CheckJoin(false, "join left");
            Capture(main, "join-left");
        }

        static void FeedbackScenes()
        {
            var context = Activator.CreateInstance(Type("FeedbackContext"), true);
            Set(context, "LauncherVersion", "UI preview");
            using (var dialog = (Form)Activator.CreateInstance(Type("FeedbackDialog"), Members, null, new[] { context }, null))
            {
                ShowOffscreen(dialog);
                var send = (Control)Get(dialog, "send");
                var cancel = (Control)Get(dialog, "cancel");
                Assert(cancel.Right < send.Left && send.Right < dialog.ClientSize.Width, "feedback actions fit");
                Assert(send.Enabled, "empty problem allows logs-only report");
                Capture(dialog, "feedback-problem");
                var tabs = Get(dialog, "typeBar");
                tabs.GetType().GetProperty("Selected").SetValue(tabs, 1, null);
                Assert(!send.Enabled, "empty suggestion cannot send");
                Capture(dialog, "feedback-suggestion-empty");
                ((TextBox)Get(dialog, "description")).Text = "UI preview: room controls remain available.";
                Assert(send.Enabled, "filled suggestion can send");
                Capture(dialog, "feedback-suggestion-filled");
            }
        }

        [STAThread]
        static int Main(string[] args)
        {
            try
            {
                CultureInfo.CurrentUICulture = new CultureInfo(args[3]);
                CultureInfo.CurrentCulture = new CultureInfo(args[3]);
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                launcher = Assembly.Load(File.ReadAllBytes(args[0]));
                mainType = Type("MainForm");
                output = Path.Combine(args[1], args[3]);
                Directory.CreateDirectory(output);
                PrepareWorkshop();
                Console.WriteLine("UI fixtures only; no launch, room requests, or settings persistence checks.");
                if (args[2] == "all" || args[2] == "host") HostScenes();
                if (args[2] == "all" || args[2] == "join") JoinScenes();
                if (args[2] == "all" || args[2] == "feedback") FeedbackScenes();
                if (args[2] == "all")
                {
                    NewMain(0, true);
                    Call(main, "ShowPresence", Presence("InGame"), null, Text("StopServer"), Install(), -1);
                    Layout();
                    Assert(!Control("autoStartBox").Visible && !Control("autoEnterBox").Visible, "solo hides room options");
                    Capture(main, "solo-playing");
                }
                Console.WriteLine("PASS " + assertions + " assertions; " + screenshots + " screenshots; " + args[3]);
                return 0;
            }
            catch (Exception error)
            {
                Console.Error.WriteLine(error);
                return 1;
            }
            finally { DisposeMain(); }
        }
    }
}
