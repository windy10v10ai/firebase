// GPL-3.0.
namespace Windy10v10AI.Launcher {
    static class NativeMethods { public static void KeepPrivate(System.Net.Sockets.Socket socket) { /* Darwin 上限制接收等待时间，避免释放套接字时阻塞。 */ socket.ReceiveTimeout = 500; } }
    static class Updater {
        public const string DirectApi="https://api.windy10v10ai.com/api/launcher/";
        public const string RelayApi="https://1491237865-7au6o0ylxt.ap-guangzhou.tencentscf.com/api/launcher/";
    }
}
