using System;
using System.Collections.Generic;
using System.Text;

namespace Windy10v10AI.Launcher
{
    // Values travel to joiners as numbers, so new ones only go at the end; older launchers show them as in game
    enum PlayerStatus { Connecting, Loading, InGame, Failed, Left, InRoom, Waiting }

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

        // Only players still in the room between games, so a player who left is not brought back
        public void SetEntering(string key)
        {
            lock (sync)
            {
                foreach (var entry in entries)
                {
                    if (entry.Key == key && (entry.Status == PlayerStatus.Waiting || entry.Status == PlayerStatus.InRoom)) entry.Status = PlayerStatus.Loading;
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

        public bool InGame(string key)
        {
            lock (sync) return entries.Exists(e => e.Key == key && e.Status == PlayerStatus.InGame);
        }

        // Everyone still in the room between games, or waiting for the next game's server
        public void SetAll(PlayerStatus status)
        {
            lock (sync)
            {
                foreach (var entry in entries)
                {
                    if (entry.Status != PlayerStatus.Failed && entry.Status != PlayerStatus.Left) entry.Status = status;
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
}
