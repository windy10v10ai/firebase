using System;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using Microsoft.Win32;

namespace Windy10v10AI.Launcher
{
    // Everything the shared core needs from the operating system; each platform build compiles its own copy of this class
    static class Platform
    {
        const int SioUdpConnReset = -1744830452;

        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool SetHandleInformation(IntPtr handle, uint mask, uint flags);

        // The account Steam is signed in with, as the 32-bit ID the game API uses; 0 when Steam is not running
        public static long SteamAccountId()
        {
            var value = Registry.GetValue(@"HKEY_CURRENT_USER\Software\Valve\Steam\ActiveProcess", "ActiveUser", null);
            return value is int ? (uint)(int)value : 0;
        }

        // Steam and Dota are started with inherited handles, and a socket they inherit keeps its port after the launcher exits
        public static void KeepPrivate(Socket socket)
        {
            SetHandleInformation(socket.Handle, 1, 0);
        }

        // Windows reports an ICMP unreachable from an earlier send as an error on the next receive of a UDP socket
        public static void IgnoreUnreachable(Socket socket)
        {
            socket.IOControl(SioUdpConnReset, new byte[] { 0 }, null);
        }
    }
}
