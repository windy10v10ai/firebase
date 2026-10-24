using System;

namespace Windy10v10AI.Launcher
{
    sealed class GameEnd
    {
        DateTime? endedAt;
        public bool Ended { get { return endedAt != null; } }
        public bool Saved { get; private set; }

        public void Reset()
        {
            endedAt = null;
            Saved = false;
        }

        public bool Track(string serverLog)
        {
            return Track(serverLog, DateTime.UtcNow);
        }

        internal bool Track(string serverLog, DateTime now)
        {
            var changed = false;
            if (!Ended && (serverLog.Contains("/api/game/end") || serverLog.Contains("entering state 'DOTA_GAMERULES_STATE_POST_GAME'")))
            {
                endedAt = now;
                changed = true;
            }
            // 游戏脚本在结算后可能停止，无法保证结果请求的回调会写入日志。
            if (Ended && !Saved && (serverLog.Contains("[Game] end game callback") || (now - endedAt.Value).TotalSeconds > 5))
            {
                Saved = true;
                changed = true;
            }
            return changed;
        }
    }
}
