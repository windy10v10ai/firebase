namespace Windy10v10AI.Launcher
{
    static class MacFeedback
    {
        static readonly string[] TopicIds = { "hero", "ability", "awaken", "item", "bot", "balance", "ui", "member", "lag", "launcher", "web" };

        public static FeedbackDraft Draft(Dictionary<string, object> command, string role, string serverLog)
        {
            var kind = Convert.ToString(command.GetValueOrDefault("kind"));
            var description = Convert.ToString(command.GetValueOrDefault("description", "")).Trim();
            if (kind != "problem" && kind != "suggestion") throw new ArgumentException(Strings.FeedbackFailed);
            if (description.Length > 1000 || (kind == "suggestion" && description.Length == 0)) throw new ArgumentException(Strings.SuggestionCue);
            var topics = (command.GetValueOrDefault("topics") as object[] ?? Array.Empty<object>()).Select(Convert.ToString).Distinct().ToList();
            if (topics.Count > 2 || topics.Any(topic => !TopicIds.Contains(topic))) throw new ArgumentException(Strings.UpToTwo);
            string mapVersion = null;
            try { mapVersion = MacInstall.Find(false).Manifest; } catch { }
            string clientLog = null;
            if (Directory.Exists(HostSession.Logs)) clientLog = Directory.EnumerateFiles(HostSession.Logs, "windymac-client-*.log").OrderByDescending(File.GetLastWriteTimeUtc).FirstOrDefault();
            return new FeedbackDraft
            {
                Type = kind,
                Description = description,
                Topics = topics,
                AttachLogs = true.Equals(command.GetValueOrDefault("attachLog", false)),
                Context = new FeedbackContext
                {
                    LauncherVersion = LauncherVersion.Current,
                    MapVersion = mapVersion,
                    Mode = role == "host" ? 1 : role == "join" ? 2 : 0,
                    ServerLogPath = serverLog,
                    ClientLogPath = clientLog
                }
            };
        }

        public static object Send(Dictionary<string, object> command, string role, string serverLog)
        {
            var result = FeedbackApi.Send(Draft(command, role, serverLog));
            var message = result == FeedbackResult.Sent ? Strings.FeedbackThanks : result == FeedbackResult.TooManyReports ? Strings.FeedbackTooMany : result == FeedbackResult.DailyLimit ? Strings.FeedbackDailyLimit : Strings.FeedbackFailed;
            return new { type = "feedback", success = result == FeedbackResult.Sent, message };
        }
    }
}
