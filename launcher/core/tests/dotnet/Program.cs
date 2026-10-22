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
                LocalGateTests.RunAll();
                TunnelPortTests.RunAll();
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
