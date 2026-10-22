namespace Windy10v10AI.Launcher
{
    sealed class SoloLifecycle
    {
        bool clientSeen;
        DateTime? lastInGame;

        public void Reset()
        {
            clientSeen = false;
            lastInGame = null;
        }

        public bool Observe(bool running, DateTime? lastPacket, bool saved, DateTime now)
        {
            var inGame = running && lastPacket != null && (now - lastPacket.Value).TotalSeconds <= 30;
            if (inGame) lastInGame = now;
            if (!running && clientSeen && lastInGame != null && (now - lastInGame.Value).TotalSeconds <= 60) return true;
            clientSeen = running;
            return saved && !inGame;
        }
    }
}
