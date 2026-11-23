namespace Windy10v10AI.Launcher
{
    static class LauncherApi
    {
        public const string Api = "https://api.windy10v10ai.com/api/";
        // Some networks in mainland China cannot reach our API directly, so they fall back to a second entry
        public const string RelayApi = "https://43.135.77.42/api/";
        public const string Direct = Api + "launcher/";
        public const string Relay = RelayApi + "launcher/";
    }
}
