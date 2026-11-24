using System;
using System.Collections.Generic;

namespace Windy10v10AI.Launcher
{
    // The anime edition's banner is picked from a gallery of pictures shipped with the launcher
    static class BannerGallery
    {
        public const string First = "anime-16";

        // The first launch has no record yet and always shows the fixed picture; later picks never repeat the last one
        public static string Pick(IList<string> names, string last, Random random)
        {
            if (names.Count == 0) return null;
            if (string.IsNullOrEmpty(last)) return names.Contains(First) ? First : names[0];
            var others = new List<string>();
            foreach (var name in names)
                if (name != last) others.Add(name);
            return others.Count == 0 ? names[0] : others[random.Next(others.Count)];
        }
    }
}
