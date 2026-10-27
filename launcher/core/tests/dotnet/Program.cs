using System;

namespace Windy10v10AI.Launcher.Tests
{
    static class Program
    {
        static int Main()
        {
            try
            {
                RelayTests.RunAll();
                RouteSwitchTests.RunAll();
                LocalGateTests.RunAll();
                TunnelPortTests.RunAll();
                SessionLifecycleTests.RunAll();
                HostRoomSessionTests.RunAll();
                FeedbackLogTests.RunAll();
                return 0;
            }
            catch (Exception error)
            {
                Console.Error.WriteLine("FAIL " + error);
                return 1;
            }
        }
    }
}
