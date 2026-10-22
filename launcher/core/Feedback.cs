using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

namespace Windy10v10AI.Launcher
{
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
        public int Mode;
        public string GameDir;
        public string ServerLogPath;
        public string ClientLogPath;
        public FeedbackError Error;
        public Dictionary<string, object> Connection;
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

    static class FeedbackApi
    {
        const int DirectTimeout = 10000;
        const int RelayTimeout = 20000;
        const int MaxLogBytes = 1024 * 1024;
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
            var local = Environment.GetEnvironmentVariable("WINDY_API");
            var routes = string.IsNullOrEmpty(local)
                ? new[] { Root(LauncherApi.Direct), Root(LauncherApi.Relay) }
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
                    if (response != null) return Classify(response);
                }
            }
            return FeedbackResult.Failed;
        }

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
                { "windowsVersion", Platform.OperatingSystemVersion() },
            };
            var description = (draft.Description ?? "").Trim();
            if (description.Length > 0) body["description"] = description;
            var steamId = Platform.SteamAccountId();
            if (steamId > 0) body["steamId"] = steamId;
            if (!string.IsNullOrEmpty(context.MapVersion)) body["mapVersion"] = context.MapVersion;
            if (context.Mode >= 0 && context.Mode < Modes.Length) body["mode"] = Modes[context.Mode];
            if (context.Connection != null) body["connection"] = context.Connection;
            var error = context.Error;
            if (error != null)
            {
                var detail = new Dictionary<string, object> { { "message", Clip(error.Message, 1000) } };
                if (!string.IsNullOrEmpty(error.Stage)) detail["stage"] = Clip(error.Stage, 50);
                if (!string.IsNullOrEmpty(error.Detail)) detail["detail"] = Clip(error.Detail, 4000);
                body["launcherError"] = detail;
            }
            if (draft.AttachLogs)
            {
                var server = PackLog(context.ServerLogPath ?? (string.IsNullOrEmpty(context.GameDir) ? null : Path.Combine(context.GameDir, "dota", "dedicated.log")));
                if (server != null) body["serverLog"] = server;
                var client = PackLog(context.ClientLogPath ?? (string.IsNullOrEmpty(context.GameDir) ? null : Path.Combine(context.GameDir, "dota", "client.log")));
                if (client != null) body["clientLog"] = client;
            }
            return body;
        }

        static string Clip(string text, int max)
        {
            text = text ?? "";
            return text.Length <= max ? text : text.Substring(0, max);
        }

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
            }
            return null;
        }

        static string ReadTail(string path, long bytes)
        {
            // 游戏运行期间仍会写日志，读取不能锁住文件。
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

        // 反馈不需要本机用户名，发送前隐藏日志路径中的用户名。
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
            }
            return FeedbackResult.Failed;
        }
    }

}
