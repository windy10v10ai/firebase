using System.Collections.Generic;
using System.Text.Json;

// Modern .NET dropped this serializer, so builds outside .NET Framework compile the core against this stand-in.
// Numbers come back as int, long or decimal like the original, because the core converts them with that assumption
namespace System.Web.Script.Serialization
{
    public class JavaScriptSerializer
    {
        public string Serialize(object value)
        {
            return JsonSerializer.Serialize(value);
        }

        public object DeserializeObject(string text)
        {
            using (var document = JsonDocument.Parse(text))
            {
                return Convert(document.RootElement);
            }
        }

        static object Convert(JsonElement element)
        {
            switch (element.ValueKind)
            {
                case JsonValueKind.Object:
                    var map = new Dictionary<string, object>();
                    foreach (var property in element.EnumerateObject()) map[property.Name] = Convert(property.Value);
                    return map;
                case JsonValueKind.Array:
                    var list = new List<object>();
                    foreach (var item in element.EnumerateArray()) list.Add(Convert(item));
                    return list.ToArray();
                case JsonValueKind.String:
                    return element.GetString();
                case JsonValueKind.Number:
                    int small;
                    if (element.TryGetInt32(out small)) return small;
                    long large;
                    if (element.TryGetInt64(out large)) return large;
                    return element.GetDecimal();
                case JsonValueKind.True:
                    return true;
                case JsonValueKind.False:
                    return false;
                default:
                    return null;
            }
        }
    }
}
