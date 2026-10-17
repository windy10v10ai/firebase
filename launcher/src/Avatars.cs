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
