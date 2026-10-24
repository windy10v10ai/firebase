// GPL-3.0.
using System.Web.Script.Serialization;
namespace Windy10v10AI.Launcher
{
    sealed class NativeBridge
    {
        readonly HostSession host = new(Program.Emit);
        readonly JoinSession join = new(Program.Emit);
        readonly MacRooms rooms;
        public NativeBridge() { rooms = new MacRooms(Program.Emit, host); }
        readonly CancellationTokenSource updateCancel = new();
        Task update = Task.CompletedTask;
        string role, lastRole;
        MacRelease release;
        Task service = Task.CompletedTask;
        Task inspection = Task.CompletedTask;
        int inspectionGeneration;
        public async Task<int> Run()
        {
            Console.CancelKeyPress += (_, e) => { e.Cancel = true; _ = Stop(); };
            Program.Emit(new { type = "state", state = "idle", message = Strings.Idle, code = "", log = "" });
            try
            {
                string line;
                while ((line = await Console.In.ReadLineAsync()) != null)
                {
                    try
                    {
                        var command = (Dictionary<string, object>)new JavaScriptSerializer().DeserializeObject(line);
                        if (!await Execute(command)) return 0;
                    }
                    catch (Exception e) { Program.Emit(new { type = "message", level = "error", message = e.Message }); }
                }
            }
            finally { await Stop(); }
            return 0;
        }
        async Task<bool> Execute(Dictionary<string, object> command)
        {
            var action = Convert.ToString(command.GetValueOrDefault("action"));
            if (action == "open" || action == "join" || action == "update" || action == "inspect" || action == "verify" || action == "subscribe") ApplyMap(command);
            switch (action)
            {
                case "open": Open(command); break;
                case "join": Join(command); break;
                case "enter": Enter(); break;
                case "auto-enter": join.SetAutoEnter(true.Equals(command.GetValueOrDefault("enabled", true))); break;
                case "next": Next(command); break;
                case "stop": await StopRoom(); break;
                case "browse": Browse(command); break;
                case "refresh": rooms.Refresh(); break;
                case "badge":
                    if (!host.Active && !join.Active && update.IsCompleted) ApplyMap(command);
                    rooms.RefreshBadge();
                    break;
                case "kick": host.Kick(Convert.ToString(command.GetValueOrDefault("key", ""))); break;
                case "reopen": host.Reopen(); break;
                case "roomSettings": host.ConfigureRoom(true.Equals(command.GetValueOrDefault("public", false)), Convert.ToInt32(command.GetValueOrDefault("maxPlayers", host.MaxPlayers))); break;
                case "inspect": Inspect(); break;
                case "update": Update(); break;
                case "verify": CheckAvailable(); rooms.Dispose(); await MacInstall.VerifyFiles(updateCancel.Token); break;
                case "subscribe": await MacInstall.SubscribeMap(updateCancel.Token); break;
                case "check-version": CheckVersion(); break;
                case "update-launcher": UpdateLauncher(); break;
                case "feedback": Feedback(command); break;
                case "quit": await Stop(); return false;
                default: throw new Exception(Strings.UnknownAction);
            }
            return true;
        }
        void Enter() { if (role == "join") join.Enter(); else host.Enter(); }
        void Next(Dictionary<string, object> command)
        {
            if (role != "host") throw new Exception(Strings.HostOnly);
            host.Next(Convert.ToString(command.GetValueOrDefault("mode", "easy")));
        }
        void CheckAvailable()
        {
            if (!update.IsCompleted) throw new Exception(Strings.WaitForMapUpdate);
            if (role == "join" && !join.Active) role = null;
            if ((role == "host" || role == "solo") && !host.Active) role = null;
            if (role != null) throw new Exception(Strings.SessionActive);
        }
        void Open(Dictionary<string, object> command)
        {
            CheckAvailable();
            rooms.Dispose();
            bool solo = Convert.ToString(command.GetValueOrDefault("sessionMode", "host")) == "solo";
            role = solo ? "solo" : "host"; lastRole = role;
            host.Start(Convert.ToString(command.GetValueOrDefault("mode", "easy")), Convert.ToInt32(command.GetValueOrDefault("maxPlayers", 10)), true.Equals(command.GetValueOrDefault("autoEnter", true)), solo, true.Equals(command.GetValueOrDefault("public", false)));
        }
        void Join(Dictionary<string, object> command)
        {
            CheckAvailable();
            var code = JoinSession.NormalizeCode(Convert.ToString(command.GetValueOrDefault("code", "")));
            join.Start(code, true.Equals(command.GetValueOrDefault("autoEnter", true)), rooms.TakeForJoin());
            role = "join"; lastRole = role;
        }
        void ApplyMap(Dictionary<string, object> command)
        {
            var wanted = true.Equals(command.GetValueOrDefault("testMap", MacInstall.UseTestMap));
            if (wanted == MacInstall.UseTestMap) return;
            CheckAvailable();
            rooms.Dispose(); MacInstall.UseTestMap = wanted;
        }
        void Browse(Dictionary<string, object> command)
        {
            if (!true.Equals(command.GetValueOrDefault("active", true))) { rooms.Dispose(); return; }
            if (join.Active || (host.Active && host.Solo) || !update.IsCompleted) throw new Exception(Strings.SessionActive);
            rooms.Start();
        }
        void Update()
        {
            if (!update.IsCompleted) return;
            CheckAvailable();
            rooms.Dispose();
            update = Workshop.Update(Program.Emit, updateCancel.Token);
        }
        void Inspect()
        {
            var generation = ++inspectionGeneration;
            MacInstall install;
            try { install = MacInstall.Find(false); }
            catch (Exception e) { Program.Emit(new { type = "inspection", details = new { installed = false, mapState = "unknown", message = e.Message } }); return; }
            inspection = Task.Run(() =>
            {
                var details = install.Inspect();
                if (generation == inspectionGeneration) Program.Emit(new { type = "inspection", details });
            });
        }
        void CheckVersion()
        {
            if (!service.IsCompleted) return;
            service = Task.Run(() =>
            {
                release = MacUpdater.FindNewer();
                Program.Emit(new { type = "release", available = release != null, version = release?.Version ?? LauncherVersion.Current, url = MacUpdater.DownloadPage });
            });
        }
        void UpdateLauncher()
        {
            CheckAvailable();
            if (!service.IsCompleted) throw new InvalidOperationException(Strings.Updating);
            rooms.Dispose();
            service = Task.Run(async () =>
            {
                try
                {
                    Program.Emit(new { type = "state", state = "updating-launcher", message = Strings.Updating, code = "", log = "" });
                    await MacUpdater.Install(release);
                    Program.Emit(new { type = "update-ready" });
                }
                catch (Exception)
                {
                    Program.Emit(new { type = "state", state = "error", message = Strings.UpdateFailed, code = "", log = "" });
                }
            });
        }
        void Feedback(Dictionary<string, object> command)
        {
            if (!service.IsCompleted) throw new InvalidOperationException(Strings.Sending);
            var contextRole = role ?? lastRole;
            var log = contextRole == "join" ? null : host.ServerLog;
            service = Task.Run(() =>
            {
                try { Program.Emit(MacFeedback.Send(command, contextRole, log)); }
                catch (Exception e) { Program.Emit(new { type = "feedback", success = false, message = e.Message }); }
            });
        }
        async Task StopRoom()
        {
            Program.Emit(new { type = "state", role = role ?? "host", state = "stopping", message = role == "join" ? Strings.LeaveRoom : role == "solo" ? Strings.StopServer : Strings.CloseRoom, code = (role == "join" ? join.Code : host.Code) ?? "", log = role == "join" ? "" : host.ServerLog ?? "" });
            rooms.Dispose();
            if (role == "join") await join.Stop(); else await host.Stop();
            role = null;
        }
        async Task Stop()
        {
            rooms.Dispose();
            updateCancel.Cancel();
            try { await Task.WhenAll(update, service, inspection); } finally { await Task.WhenAll(host.Stop(), join.Stop()); role = null; }
        }
    }
}
