using System;
using System.Collections.Generic;
using System.IO;

namespace Windy10v10AI.Launcher
{
    // The player's last choices, kept in a small text file rather than the registry so removing the folder removes them.
    // Any read or write failure falls back to the defaults
    static class Settings
    {
        public const int MinPlayers = 2;
        public const int PlayerLimit = 10;

        public static int Mode;
        public static bool PublicRoom = true;
        public static int MaxPlayers = PlayerLimit;

        public static string Folder
        {
            get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Windy10v10AI"); }
        }

        static string FilePath
        {
            get { return Path.Combine(Folder, "settings.txt"); }
        }

        public static void Load()
        {
            try
            {
                if (!File.Exists(FilePath)) return;
                var values = new Dictionary<string, string>();
                foreach (var line in File.ReadAllLines(FilePath))
                {
                    var split = line.IndexOf('=');
                    if (split > 0) values[line.Substring(0, split).Trim()] = line.Substring(split + 1).Trim();
                }
                string value;
                int number;
                if (values.TryGetValue("mode", out value) && int.TryParse(value, out number) && number >= 0 && number <= 2) Mode = number;
                if (values.TryGetValue("public", out value)) PublicRoom = value != "0";
                if (values.TryGetValue("maxPlayers", out value) && int.TryParse(value, out number) && number >= MinPlayers && number <= PlayerLimit) MaxPlayers = number;
            }
            catch (Exception)
            {
            }
        }

        public static void Save()
        {
            try
            {
                Directory.CreateDirectory(Folder);
                File.WriteAllLines(FilePath, new[]
                {
                    "mode=" + Mode,
                    "public=" + (PublicRoom ? "1" : "0"),
                    "maxPlayers=" + MaxPlayers,
                });
            }
            catch (Exception)
            {
            }
        }
    }
}
