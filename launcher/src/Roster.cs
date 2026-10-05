using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Threading;

namespace Windy10v10AI.Launcher
{
    enum PlayerStatus { Connecting, Loading, InGame, Failed, Left }

    class RosterEntry
    {
        public long SteamId;
        // Identifies the entry when the joiner's Steam ID is unknown
        public string Key;
        public string Name;
        public string AvatarUrl;
        public PlayerStatus Status;
        public bool IsHost;
        public DateTime Ended;

        public RosterEntry Copy()
        {
            return (RosterEntry)MemberwiseClone();
        }

        // One entry per packet keeps every roster packet well under a UDP datagram, avatar url included
        public byte[] Encode(int index, int count)
        {
            var fields = new[] { index.ToString(), count.ToString(), SteamId.ToString(), ((int)Status).ToString(), IsHost ? "1" : "0", Clean(Name), Clean(AvatarUrl) };
            return Encoding.UTF8.GetBytes(string.Join("\t", fields));
        }

        public static RosterEntry Decode(byte[] data, int offset, out int index, out int count)
        {
            var fields = Encoding.UTF8.GetString(data, offset, data.Length - offset).Split('\t');
            index = int.Parse(fields[0]);
            count = int.Parse(fields[1]);
            return new RosterEntry
            {
                SteamId = long.Parse(fields[2]),
                Status = (PlayerStatus)int.Parse(fields[3]),
                IsHost = fields[4] == "1",
                Name = fields[5],
                AvatarUrl = fields[6].Length == 0 ? null : fields[6],
            };
        }

        static string Clean(string text)
        {
            return text == null ? "" : text.Replace('\t', ' ');
        }
    }

    // The host's view of who is in the room; joiners receive copies of it through the tunnel
    class HostRoster
    {
        // Ended entries linger long enough for the host to notice, then make room
        const int EndedLingerMs = 30000;
        const long SteamId64Base = 76561197960265728;

        readonly object sync = new object();
        readonly List<RosterEntry> entries = new List<RosterEntry>();

        public void Add(RosterEntry entry)
        {
            lock (sync)
            {
                // A player who leaves and joins again takes back their own row
                entries.RemoveAll(e => !e.IsHost && entry.SteamId != 0 && e.SteamId == entry.SteamId);
                entries.Add(entry);
            }
        }

        public void SetStatus(string key, PlayerStatus status)
        {
            lock (sync)
            {
                foreach (var entry in entries)
                {
                    if (entry.Key != key) continue;
                    // The game log may report the player before the handshake result arrives
                    if (status == PlayerStatus.Loading && entry.Status == PlayerStatus.InGame) continue;
                    entry.Status = status;
                    if (status == PlayerStatus.Failed || status == PlayerStatus.Left) entry.Ended = DateTime.UtcNow;
                }
            }
        }

        // The dedicated server logs 64-bit Steam IDs; the API uses the 32-bit account ID
        public void SetInGame(long steamId64)
        {
            var account = steamId64 - SteamId64Base;
            lock (sync)
            {
                foreach (var entry in entries)
                {
                    if (entry.SteamId == account && entry.Status != PlayerStatus.Left) entry.Status = PlayerStatus.InGame;
                }
            }
        }

        public void Remove(string key)
        {
            lock (sync) entries.RemoveAll(e => !e.IsHost && e.Key == key);
        }

        public RosterEntry Find(string key)
        {
            lock (sync)
            {
                var entry = entries.Find(e => e.Key == key);
                return entry == null ? null : entry.Copy();
            }
        }

        // Players who hold or may still take a slot; the room limit and the public list count these
        public int ActiveCount()
        {
            lock (sync) return entries.FindAll(e => e.Status != PlayerStatus.Failed && e.Status != PlayerStatus.Left).Count;
        }

        public int GuestCount()
        {
            lock (sync) return entries.FindAll(e => !e.IsHost && e.Status != PlayerStatus.Failed && e.Status != PlayerStatus.Left).Count;
        }

        public List<RosterEntry> Snapshot()
        {
            lock (sync)
            {
                entries.RemoveAll(e => (e.Status == PlayerStatus.Failed || e.Status == PlayerStatus.Left) &&
                    (DateTime.UtcNow - e.Ended).TotalMilliseconds > EndedLingerMs);
                return entries.ConvertAll(e => e.Copy());
            }
        }
    }

    // Steam avatars load in the background; a row shows its initial until the picture arrives or if it never does.
    // Pictures are kept on disk by url: Steam gives a changed avatar a new url, so a cached file never goes stale
    static class Avatars
    {
        const int TimeoutMs = 8000;
        const int KeepDays = 30;
        static readonly object sync = new object();
        static readonly Dictionary<string, Image> loaded = new Dictionary<string, Image>();
        static readonly HashSet<string> requested = new HashSet<string>();

        static string Folder
        {
            get { return Path.Combine(Settings.Folder, "avatars"); }
        }

        public static Image Get(string url)
        {
            if (string.IsNullOrEmpty(url)) return null;
            lock (sync)
            {
                Image image;
                if (loaded.TryGetValue(url, out image)) return image;
                if (!requested.Add(url)) return null;
            }
            new Thread(() =>
            {
                var file = Path.Combine(Folder, Hash(url));
                var bytes = ReadCached(file);
                if (bytes == null)
                {
                    bytes = Download(url);
                    if (bytes == null) return;
                    try
                    {
                        Directory.CreateDirectory(Folder);
                        File.WriteAllBytes(file, bytes);
                    }
                    catch (Exception)
                    {
                        // Only the cache is lost; the picture still shows this time
                    }
                }
                try
                {
                    using (var buffer = new MemoryStream(bytes))
                    using (var decoded = Image.FromStream(buffer))
                    {
                        // A decoded image keeps reading its stream, so it is copied before the stream closes
                        var image = new Bitmap(decoded);
                        lock (sync) loaded[url] = image;
                    }
                }
                catch (Exception)
                {
                    // A damaged file keeps the initial
                }
            }) { IsBackground = true }.Start();
            return null;
        }

        static byte[] ReadCached(string file)
        {
            try
            {
                if (!File.Exists(file)) return null;
                // Windows often stops updating last access times, so the cleanup goes by a write on every use
                File.SetLastWriteTimeUtc(file, DateTime.UtcNow);
                return File.ReadAllBytes(file);
            }
            catch (Exception)
            {
                return null;
            }
        }

        static byte[] Download(string url)
        {
            try
            {
                var request = (HttpWebRequest)WebRequest.Create(url);
                request.Timeout = TimeoutMs;
                request.ReadWriteTimeout = TimeoutMs;
                using (var response = request.GetResponse())
                using (var stream = response.GetResponseStream())
                using (var buffer = new MemoryStream())
                {
                    stream.CopyTo(buffer);
                    return buffer.ToArray();
                }
            }
            catch (Exception)
            {
                // Steam's image host is slow or blocked on some networks; the initial stays
                return null;
            }
        }

        static string Hash(string url)
        {
            using (var sha = SHA1.Create())
            {
                return BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(url))).Replace("-", "").ToLowerInvariant();
            }
        }

        public static void RemoveUnused()
        {
            new Thread(() =>
            {
                try
                {
                    if (!Directory.Exists(Folder)) return;
                    foreach (var file in Directory.GetFiles(Folder))
                    {
                        if ((DateTime.UtcNow - File.GetLastWriteTimeUtc(file)).TotalDays > KeepDays) File.Delete(file);
                    }
                }
                catch (Exception)
                {
                    // A file in use stays until a later start
                }
            }) { IsBackground = true }.Start();
        }
    }
}
