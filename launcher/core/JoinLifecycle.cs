namespace Windy10v10AI.Launcher
{
    enum JoinState { Waiting, Ready, Ended, Closed, Kicked, HostLost }

    sealed class JoinLifecycle
    {
        int game;
        bool handled;
        bool firstGame;
        public JoinState State { get; private set; }
        public bool GameChanged { get; private set; }
        public bool NewGameReady { get; private set; }
        public bool FirstGame { get; private set; }

        public JoinLifecycle(int game, bool entered)
        {
            this.game = game;
            handled = entered;
            firstGame = !entered;
        }

        public void Observe(JoinTunnel tunnel)
        {
            Observe(tunnel.Game, tunnel.HasRoster, tunnel.GameReady, tunnel.GameEnded, tunnel.Kicked, tunnel.Lost);
        }

        internal void Observe(int game, bool hasRoster, bool ready, bool ended, bool kicked, bool lost)
        {
            GameChanged = this.game != game;
            if (GameChanged) { this.game = game; handled = false; }
            State = kicked ? JoinState.Kicked : lost ? (ended || !ready ? JoinState.Closed : JoinState.HostLost)
                : !hasRoster ? JoinState.Waiting : ended ? JoinState.Ended : ready ? JoinState.Ready : JoinState.Waiting;
            NewGameReady = State == JoinState.Ready && !handled;
            FirstGame = firstGame;
            if (NewGameReady) { handled = true; firstGame = false; }
        }
    }
}
