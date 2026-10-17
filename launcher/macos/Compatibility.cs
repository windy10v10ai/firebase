// GPL-3.0.
using System.Text.Json;
namespace System.Web.Script.Serialization {
    public class JavaScriptSerializer {
        public string Serialize(object value) => JsonSerializer.Serialize(value);
        public object DeserializeObject(string text) { using var doc=JsonDocument.Parse(text); return ConvertValue(doc.RootElement); }
        static object ConvertValue(JsonElement e) => e.ValueKind switch {
            JsonValueKind.Object => e.EnumerateObject().ToDictionary(x=>x.Name,x=>ConvertValue(x.Value)),
            JsonValueKind.Array => e.EnumerateArray().Select(ConvertValue).ToArray(),
            JsonValueKind.String => e.GetString(), JsonValueKind.True => true, JsonValueKind.False => false,
            JsonValueKind.Number => e.TryGetInt64(out var n) ? (object)n : e.GetDouble(), _ => null
        };
    }
}
namespace Windy10v10AI.Launcher {
    static class NativeMethods { public static void KeepPrivate(System.Net.Sockets.Socket socket) { /* Darwin 上限制接收等待时间，避免释放套接字时阻塞。 */ socket.ReceiveTimeout = 500; } }
    static class Updater {
        public const string DirectApi="https://api.windy10v10ai.com/api/launcher/";
        public const string RelayApi="https://1491237865-7au6o0ylxt.ap-guangzhou.tencentscf.com/api/launcher/";
    }
}
