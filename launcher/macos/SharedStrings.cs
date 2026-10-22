using System.Globalization;
using System.Reflection;
using System.Text.Json;

namespace Windy10v10AI.Launcher
{
    static class SharedStrings
    {
        public static int Export(string culture)
        {
            CultureInfo.CurrentUICulture = CultureInfo.GetCultureInfo(culture);
            var values = typeof(Strings).GetProperties(BindingFlags.Public | BindingFlags.Static)
                .Where(property => property.PropertyType == typeof(string))
                .ToDictionary(property => property.Name, property => (string)property.GetValue(null));
            var topicKeys = new[] { "TopicHero", "TopicAbility", "TopicAwakening", "TopicItem", "TopicBot", "TopicBalance", "TopicUI", "TopicMembership", "TopicLag", "TopicLauncher", "TopicWebsite" };
            var topics = Strings.TopicNames;
            for (var index = 0; index < topicKeys.Length; index++) values[topicKeys[index]] = topics[index];
            Console.WriteLine(JsonSerializer.Serialize(values));
            return 0;
        }
    }
}
