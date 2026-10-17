using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using Microsoft.Win32;

namespace Windy10v10AI.Launcher
{
    enum MapState { NoSteam, NoDota, Missing, Checking, Unverified, Outdated, Ready }

    class DotaInstall
    {
        const string DotaExe = @"steamapps\common\dota 2 beta\game\bin\win64\dota2.exe";

        public readonly string Library;

        DotaInstall(string library)
        {
            Library = library;
        }

        public string Game { get { return Path.Combine(Library, @"steamapps\common\dota 2 beta\game"); } }
        public string Exe { get { return Path.Combine(Game, @"bin\win64\dota2.exe"); } }

        public string Vpk(string id)
        {
            return Path.Combine(Library, @"steamapps\workshop\content\570\" + id + @"\" + id + ".vpk");
        }

        public static string SteamPath()
        {
            var steam = Registry.GetValue(@"HKEY_CURRENT_USER\Software\Valve\Steam", "SteamPath", null) as string;
            return steam == null ? null : steam.Replace('/', '\\');
        }

        public static string SteamExecutable()
        {
            var registered = Registry.GetValue(@"HKEY_CURRENT_USER\Software\Valve\Steam", "SteamExe", null) as string;
            return FindSteamExecutable(registered == null ? null : registered.Replace('/', '\\'), SteamPath());
        }

        internal static string FindSteamExecutable(string registeredExe, string steamPath)
        {
            if (registeredExe != null && File.Exists(registeredExe)) return registeredExe;
            if (steamPath == null) return null;
            var steam = Path.Combine(steamPath, "steam.exe");
            if (File.Exists(steam)) return steam;
            var steamChina = Path.Combine(steamPath, "steamchina.exe");
            return File.Exists(steamChina) ? steamChina : null;
        }

        // Dota may live in any Steam library, so every library listed by Steam is checked
        public static DotaInstall Find()
        {
            var steam = SteamPath();
            if (steam == null) return null;
            if (File.Exists(Path.Combine(steam, DotaExe))) return new DotaInstall(steam);

            var vdf = Path.Combine(steam, @"steamapps\libraryfolders.vdf");
            if (!File.Exists(vdf)) return null;
            foreach (Match match in Regex.Matches(File.ReadAllText(vdf), "\"path\"\\s+\"([^\"]+)\""))
            {
                var library = match.Groups[1].Value.Replace(@"\\", @"\");
                if (File.Exists(Path.Combine(library, DotaExe))) return new DotaInstall(library);
            }
            return null;
        }

        public static MapState Check(string id, out DotaInstall install)
        {
            install = null;
            if (SteamPath() == null) return MapState.NoSteam;
            install = Find();
            if (install == null) return MapState.NoDota;
            if (!File.Exists(install.Vpk(id))) return MapState.Missing;
            bool checking;
            var published = WorkshopLatest.Manifest(id, out checking);
            if (published != null) return install.IsOutdated(id, published) ? MapState.Outdated : MapState.Ready;
            if (checking) return MapState.Checking;
            // Steam's own latest_timeupdated can stay stale for days, so it can prove an update exists but never
            // that the map is current
            return install.HasKnownUpdate(id) ? MapState.Outdated : MapState.Unverified;
        }

        // The build Steam installed, compared between host and joiners so both run the same map
        public string InstalledManifest(string id)
        {
            foreach (var block in AcfBlocks(id))
            {
                var manifest = ReadValue(block, "manifest");
                if (manifest != null) return manifest;
            }
            return null;
        }

        bool IsOutdated(string id, string published)
        {
            foreach (var block in AcfBlocks(id))
            {
                var manifest = ReadValue(block, "manifest");
                if (manifest != null && manifest != published) return true;
            }
            return false;
        }

        bool HasKnownUpdate(string id)
        {
            long installed = 0, latest = 0;
            foreach (var block in AcfBlocks(id))
            {
                installed = Math.Max(installed, ReadLong(block, "timeupdated"));
                latest = Math.Max(latest, ReadLong(block, "latest_timeupdated"));
            }
            return latest > installed;
        }

        // Steam keeps one block per Workshop item for the installed build and another for its details
        List<string> AcfBlocks(string id)
        {
            var blocks = new List<string>();
            try
            {
                var acf = Path.Combine(Library, @"steamapps\workshop\appworkshop_570.acf");
                if (!File.Exists(acf)) return blocks;
                var pattern = "\"" + id + "\"\\s*\\{([^}]*)\\}";
                foreach (Match block in Regex.Matches(File.ReadAllText(acf), pattern)) blocks.Add(block.Groups[1].Value);
            }
            catch (Exception)
            {
                // Steam may be rewriting the file; the next check reads it again
            }
            return blocks;
        }

        static string ReadValue(string block, string key)
        {
            var match = Regex.Match(block, "\"" + key + "\"\\s+\"(\\d+)\"");
            return match.Success ? match.Groups[1].Value : null;
        }

        static long ReadLong(string block, string key)
        {
            var value = ReadValue(block, key);
            return value == null ? 0 : long.Parse(value);
        }
    }

    // Has the running Steam client fetch the newest build of a Workshop item, talking to it through the Steam API that
    // ships with Dota 2. Steam's periodic check reads an update feed that can lag a release by many minutes; subscribing
    // to an item Steam already has makes it ask the server for that item directly.
    static class WorkshopDownload
    {
        public const string Flag = "--update-workshop-item";
        const uint Downloading = 16;
        const uint DownloadPending = 32;
        const int SubscribeTimeoutMs = 15000;
        const int DownloadTimeoutMs = 10 * 60 * 1000;
        const int ChildTimeoutMs = DownloadTimeoutMs + 60 * 1000;
        const int ReleaseTimeoutMs = 30 * 1000;

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        static extern IntPtr LoadLibrary(string path);

        [DllImport("kernel32.dll", CharSet = CharSet.Ansi)]
        static extern IntPtr GetProcAddress(IntPtr module, string name);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int InitFn(StringBuilder error);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate void VoidFn();
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate IntPtr InterfaceFn();
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate ulong SubscribeFn(IntPtr ugc, ulong id);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] [return: MarshalAs(UnmanagedType.I1)] delegate bool CallDoneFn(IntPtr utils, ulong call, [MarshalAs(UnmanagedType.I1)] out bool failed);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] [return: MarshalAs(UnmanagedType.I1)] delegate bool DownloadFn(IntPtr ugc, ulong id, [MarshalAs(UnmanagedType.I1)] bool highPriority);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate uint StateFn(IntPtr ugc, ulong id);

        // Returns false when Steam could not be asked. Steam counts every process that opens the Steam API as Dota 2
        // running until it exits, which would stop the launcher from starting Dota, so the work runs in a child process.
        public static bool Run(string id)
        {
            var steamWasRunningDota = DotaRunning();
            int exitCode;
            try
            {
                var start = new ProcessStartInfo(typeof(WorkshopDownload).Assembly.Location, Flag + " " + id) { UseShellExecute = false };
                start.EnvironmentVariables["SteamAppId"] = "570";
                using (var child = Process.Start(start))
                {
                    if (!child.WaitForExit(ChildTimeoutMs))
                    {
                        child.Kill();
                        return false;
                    }
                    exitCode = child.ExitCode;
                }
            }
            catch (Exception)
            {
                return false;
            }
            // Steam notices the exit some seconds later, and a launch before that finds Dota still marked as running
            var watch = Stopwatch.StartNew();
            while (!steamWasRunningDota && DotaRunning() && watch.ElapsedMilliseconds < ReleaseTimeoutMs) Thread.Sleep(500);
            return exitCode == 0;
        }

        static bool DotaRunning()
        {
            var running = Registry.GetValue(@"HKEY_CURRENT_USER\Software\Valve\Steam\Apps\570", "Running", 0);
            return running is int && (int)running != 0;
        }

        // Entry point of the child process; the Steam API identifies the game by the SteamAppId variable it was given
        public static int RunChild(string id)
        {
            var install = DotaInstall.Find();
            return install != null && Ask(install, id) ? 0 : 1;
        }

        static bool Ask(DotaInstall install, string id)
        {
            if (IntPtr.Size != 8) return false;
            var lib = LoadLibrary(Path.Combine(install.Game, @"bin\win64\steam_api64.dll"));
            if (lib == IntPtr.Zero) return false;
            try
            {
                var init = Fn<InitFn>(lib, "SteamAPI_InitFlat");
                var ugcFn = UgcInterface(lib);
                if (init == null || ugcFn == null || init(new StringBuilder(1024)) != 0) return false;
                try
                {
                    return Download(lib, ugcFn(), ulong.Parse(id));
                }
                finally
                {
                    Fn<VoidFn>(lib, "SteamAPI_Shutdown")();
                }
            }
            catch (Exception)
            {
                return false;
            }
        }

        static bool Download(IntPtr lib, IntPtr ugc, ulong id)
        {
            var run = Fn<VoidFn>(lib, "SteamAPI_RunCallbacks");
            var utils = Fn<InterfaceFn>(lib, "SteamAPI_SteamUtils_v010")();
            var callDone = Fn<CallDoneFn>(lib, "SteamAPI_ISteamUtils_IsAPICallCompleted");
            var state = Fn<StateFn>(lib, "SteamAPI_ISteamUGC_GetItemState");

            var call = Fn<SubscribeFn>(lib, "SteamAPI_ISteamUGC_SubscribeItem")(ugc, id);
            var watch = Stopwatch.StartNew();
            bool failed;
            while (!callDone(utils, call, out failed) && watch.ElapsedMilliseconds < SubscribeTimeoutMs)
            {
                run();
                Thread.Sleep(100);
            }
            if (!Fn<DownloadFn>(lib, "SteamAPI_ISteamUGC_DownloadItem")(ugc, id, true)) return false;

            watch.Restart();
            while (watch.ElapsedMilliseconds < DownloadTimeoutMs)
            {
                run();
                // Steam may take a moment to queue the job after accepting the request
                if (watch.ElapsedMilliseconds > 1000 && (state(ugc, id) & (Downloading | DownloadPending)) == 0) return true;
                Thread.Sleep(500);
            }
            return true;
        }

        // Dota updates its copy of the Steam API now and then, which renames the versioned accessor
        static InterfaceFn UgcInterface(IntPtr lib)
        {
            for (var version = 30; version >= 21; version--)
            {
                var accessor = Fn<InterfaceFn>(lib, "SteamAPI_SteamUGC_v" + version.ToString("000"));
                if (accessor != null) return accessor;
            }
            return null;
        }

        static T Fn<T>(IntPtr lib, string name) where T : class
        {
            var address = GetProcAddress(lib, name);
            return address == IntPtr.Zero ? null : Marshal.GetDelegateForFunctionPointer(address, typeof(T)) as T;
        }
    }

    // Looks up the manifest of the currently published build. Requests run in the background and results are cached,
    // because map checks run on the UI thread every few seconds.
    static class WorkshopLatest
    {
        const string SteamUrl = "https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/";
        // Some networks in mainland China cannot reach Steam's API, so our backend asks Steam on their behalf
        const string RelayUrl = LauncherApi.Relay + "workshop/";
        const int SteamTimeout = 4000;
        // Covers a cold start of the proxy and the backend behind it
        const int RelayTimeout = 8000;
        static readonly TimeSpan RefreshAfter = TimeSpan.FromMinutes(30);
        static readonly TimeSpan RetryAfter = TimeSpan.FromMinutes(5);

        static readonly object sync = new object();
        static readonly Dictionary<string, string> manifests = new Dictionary<string, string>();
        static readonly Dictionary<string, DateTime> attempts = new Dictionary<string, DateTime>();
        static readonly HashSet<string> pending = new HashSet<string>();

        // Raised on a background thread when a request finishes, successfully or not
        public static event Action Changed;

        // Returns null until a request succeeds; checking is true while the first answer is still on its way.
        // Each call may start a refresh in the background.
        public static string Manifest(string id, out bool checking)
        {
            lock (sync)
            {
                string manifest;
                var known = manifests.TryGetValue(id, out manifest);
                DateTime last;
                if (!pending.Contains(id) &&
                    (!attempts.TryGetValue(id, out last) || DateTime.UtcNow - last > (known ? RefreshAfter : RetryAfter)))
                {
                    attempts[id] = DateTime.UtcNow;
                    pending.Add(id);
                    new Thread(() => Fetch(id)) { IsBackground = true }.Start();
                }
                checking = !known && pending.Contains(id);
                return known ? manifest : null;
            }
        }

        static void Fetch(string id)
        {
            var manifest = FromSteam(id) ?? FromRelay(id);
            lock (sync)
            {
                if (manifest != null) manifests[id] = manifest;
                pending.Remove(id);
            }
            var changed = Changed;
            if (changed != null) changed();
        }

        static string FromSteam(string id)
        {
            try
            {
                var root = Http.Json(SteamUrl, "itemcount=1&publishedfileids%5B0%5D=" + id, SteamTimeout);
                var details = (object[])((Dictionary<string, object>)root["response"])["publishedfiledetails"];
                foreach (Dictionary<string, object> item in details)
                {
                    object manifest;
                    if (Convert.ToString(item["publishedfileid"]) == id && item.TryGetValue("hcontent_file", out manifest))
                    {
                        return Convert.ToString(manifest);
                    }
                }
            }
            catch (Exception)
            {
                // Blocked or offline: the relay gets a chance next
            }
            return null;
        }

        static string FromRelay(string id)
        {
            try
            {
                object manifest;
                return Http.Json(RelayUrl + id, null, RelayTimeout).TryGetValue("manifest", out manifest)
                    ? Convert.ToString(manifest)
                    : null;
            }
            catch (Exception)
            {
                // Both sources failed: RetryAfter schedules the next attempt
                return null;
            }
        }
    }
}
