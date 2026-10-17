// GPL-3.0.
using System.Text.Json;
namespace Windy10v10AI.Launcher {
    static class Program {
        static readonly object output=new();
        public static void Emit(object value) {lock(output)Console.WriteLine(JsonSerializer.Serialize(value));}
        public static async Task<int> Main(string[] args) {
            var result=await RunCommandLine(args);
            return result ?? await new NativeBridge().Run();
        }
        static async Task<int?> RunCommandLine(string[] args) {
            if(args.Length==2&&args[0]=="--join-room-test")return await Tests.LiveJoinRoomTest.Run(args[1]);
            if(args.Contains("--signon-test"))return RunSignonTests();
            if(args.Contains("--self-test"))return await IntegrationTests.Run();
            if(args.Contains("--inspect"))return Inspect();
            if(args.Contains("--transport-test"))return await IntegrationTests.Transport();
            if(args.Contains("--local-client-test"))return await IntegrationTests.Live(true,true);
            if(args.Contains("--live-test"))return await IntegrationTests.Live(args.Contains("--enter-client"));
            return null;
        }
        static int RunSignonTests() {
            try{SignonTests.RunAll();return 0;}catch(Exception e){Console.Error.WriteLine(e);return 1;}
        }
        static int Inspect() {
            try{Emit(MacInstall.Find().Inspect());return 0;}catch(Exception e){Emit(new{error=e.Message});return 1;}
        }
    }
}
