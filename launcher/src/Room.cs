using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;
using System.Web.Script.Serialization;

namespace Windy10v10AI.Launcher
{
    class RoomError : Exception
    {
        // Error code from the API body, or "network" when no route answered
        public readonly string Code;

        public RoomError(string code) : base(code)
        {
            Code = code;
        }
    }

    // Client of the room API that only exchanges addresses; game traffic never goes through it
    static class RoomApi
    {
        // Bumped whenever the tunnel packets change, so mismatched launchers fail with a clear message
        public const int ProtocolVersion = 3;
        const int DirectTimeout = 4000;
        const int RelayTimeout = 8000;

        static RoomApi()
        {
            ServicePointManager.SecurityProtocol |= (SecurityProtocolType)3072;
        }

        public static Dictionary<string, object> Host(Dictionary<string, object> body)
        {
            return Post("host", body);
        }

        public static Dictionary<string, object> Join(string code, Dictionary<string, object> body)
        {
            return Post(Uri.EscapeDataString(code.Trim().ToUpperInvariant()) + "/join", body);
        }

        public static Dictionary<string, object> List(Dictionary<string, object> body)
        {
            return Post("list", body);
        }

        static Dictionary<string, object> Post(string path, Dictionary<string, object> body)
        {
            var json = new JavaScriptSerializer().Serialize(body);
            // For local testing against an API on this machine
            var local = Environment.GetEnvironmentVariable("WINDY_API");
            var routes = string.IsNullOrEmpty(local)
                ? new[] { Updater.DirectApi, Updater.RelayApi }
                : new[] { local.TrimEnd('/') + "/api/launcher/" };
            for (var i = 0; i < routes.Length; i++)
            {
                try
                {
                    return Send(routes[i] + "rooms/" + path, json, i == 0 ? DirectTimeout : RelayTimeout);
                }
                catch (WebException error)
                {
                    var response = error.Response as HttpWebResponse;
                    // The API answered, so another route would get the same answer
                    if (response != null) throw new RoomError(ReadCode(response));
                }
            }
            throw new RoomError("network");
        }

        static Dictionary<string, object> Send(string url, string json, int timeout)
        {
            var request = (HttpWebRequest)WebRequest.Create(url);
            request.Method = "POST";
            request.ContentType = "application/json";
            request.Timeout = timeout;
            request.ReadWriteTimeout = timeout;
            var bytes = Encoding.UTF8.GetBytes(json);
            using (var stream = request.GetRequestStream()) stream.Write(bytes, 0, bytes.Length);
            using (var response = request.GetResponse())
            using (var reader = new StreamReader(response.GetResponseStream(), Encoding.UTF8))
            {
                return (Dictionary<string, object>)new JavaScriptSerializer().DeserializeObject(reader.ReadToEnd());
            }
        }

        static string ReadCode(HttpWebResponse response)
        {
            try
            {
                using (var reader = new StreamReader(response.GetResponseStream(), Encoding.UTF8))
                {
                    var body = new JavaScriptSerializer().DeserializeObject(reader.ReadToEnd()) as Dictionary<string, object>;
                    if (body != null && body.ContainsKey("code") && body["code"] is string) return (string)body["code"];
                }
            }
            catch (Exception)
            {
            }
            return ((int)response.StatusCode).ToString();
        }
    }
}
