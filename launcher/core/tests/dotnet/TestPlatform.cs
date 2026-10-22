using System.Net.Sockets;

namespace Windy10v10AI.Launcher
{
    // The core tests start no Steam or Dota, so no account is signed in and no child process can inherit a socket
    static class Platform
    {
        public static long SteamAccountId()
        {
            return 0;
        }

        // Closing a socket on macOS and Linux does not wake a thread blocked in Receive, so the core's loops would never see Dispose
        public static void KeepPrivate(Socket socket)
        {
            socket.ReceiveTimeout = 500;
        }

        public static void IgnoreUnreachable(Socket socket)
        {
        }
    }
}
