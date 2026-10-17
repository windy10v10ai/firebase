using System;
using System.Collections.Generic;

using System.IO;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Threading;

namespace Windy10v10AI.Launcher
{
    // 状态值参与协议传输，新增状态只能追加以保持兼容。
    enum PlayerStatus { Connecting, Loading, InGame, Failed, Left, InRoom, Waiting }

    class RosterEntry
    {
        public long SteamId;
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

        // 名单逐项发送，避免报文超出 UDP 数据报容量。
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

    class HostRoster
    {
        // 结束状态需短暂保留，便于房主察觉玩家离开。
        const int EndedLingerMs = 30000;
        const long SteamId64Base = 76561197960265728;

        readonly object sync = new object();
        readonly List<RosterEntry> entries = new List<RosterEntry>();

        public void Add(RosterEntry entry)
        {
            lock (sync)
            {
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
                    // 进图日志可能先于握手结果到达，后到的结果不能覆盖游戏中状态。
                    if (status == PlayerStatus.Loading && entry.Status == PlayerStatus.InGame) continue;
                    entry.Status = status;
                    if (status == PlayerStatus.Failed || status == PlayerStatus.Left) entry.Ended = DateTime.UtcNow;
                }
            }
        }

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

        // 服务器日志与房间服务使用不同宽度的 Steam 标识，需要转换。
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
