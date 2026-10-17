namespace Windy10v10AI.Launcher
{
    static class LauncherApi
    {
        public const string Direct = "https://api.windy10v10ai.com/api/launcher/";
        // Some networks in mainland China cannot reach our API directly, so they go through the same China proxy the game uses
        public const string Relay = "https://1491237865-7au6o0ylxt.ap-guangzhou.tencentscf.com/api/launcher/";
    }
}
