using System.Net.Sockets;

namespace Windy10v10AI.Launcher
{
    static class Platform
    {
        public static long SteamAccountId()
        {
            return MacInstall.AccountId();
        }

        public static void KeepPrivate(Socket socket)
        {
            // macOS 关闭套接字不会唤醒同步接收线程，超时让线程能检查退出状态。
            socket.ReceiveTimeout = 500;
        }

        public static void IgnoreUnreachable(Socket socket)
        {
        }
        public static string OperatingSystemVersion()
        {
            return System.Runtime.InteropServices.RuntimeInformation.OSDescription;
        }

    }
}
