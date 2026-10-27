using System;
using System.IO;
using System.Text;

namespace Windy10v10AI.Launcher.Tests
{
    static class FeedbackLogTests
    {
        public static void RunAll()
        {
            var path = Path.Combine(Path.GetTempPath(), "feedback-log-" + Guid.NewGuid().ToString("N") + ".log");
            try
            {
                var lines = new StringBuilder();
                for (var i = 0; i < 100; i++) lines.Append("line-" + i.ToString("D3") + "\n");
                File.WriteAllText(path, lines.ToString());

                if (FeedbackApi.ReadHeadAndTail(path, 1000) != lines.ToString()) throw new Exception("a short log must be kept whole");

                var cut = FeedbackApi.ReadHeadAndTail(path, 100);
                if (!cut.StartsWith("line-000\n")) throw new Exception("the head must start at the first line");
                if (!cut.EndsWith("line-099\n")) throw new Exception("the tail must end at the last line");
                if (!cut.Contains("[launcher] log middle omitted")) throw new Exception("the cut must be marked");
                if (cut.Contains("line-050")) throw new Exception("the middle must be dropped");
                foreach (var line in cut.Split('\n'))
                {
                    if (line.Length != 0 && !line.StartsWith("line-") && !line.StartsWith("[launcher]")) throw new Exception("a cut must not leave half lines: " + line);
                }

                if (string.IsNullOrEmpty(FeedbackApi.PackLog(path))) throw new Exception("a small log must pack");
                if (FeedbackApi.PackLog(path + ".missing") != null) throw new Exception("a missing log must give no attachment");
            }
            finally
            {
                File.Delete(path);
            }
        }
    }
}
