namespace Windy10v10AI.Launcher
{
    static class LauncherApi
    {
        public const string Api = "https://api.windy10v10ai.com/api/";
        // Some networks in mainland China cannot reach our API directly, so they go through the same China proxy the game uses
        public const string RelayApi = "https://1491237865-7au6o0ylxt.ap-guangzhou.tencentscf.com/api/";
        public const string Direct = Api + "launcher/";
        public const string Relay = RelayApi + "launcher/";
    }
}
