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
