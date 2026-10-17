using System.Reflection;
namespace Windy10v10AI.Launcher {
    static class SignonTests {
        public static void RunAll() {
            var host=new HostSession(_=>{});
            host.Roster.Add(new RosterEntry{SteamId=1234,Key="host",IsHost=true,Status=PlayerStatus.Loading});
            var line=typeof(HostSession).GetMethod("ServerLine",BindingFlags.Instance|BindingFlags.NonPublic);
            line.Invoke(host,new object[]{"CDOTA_PlayerResource: Adding player SteamID 76561197960266962 to PlayerID 0 FakeClient=0"});
            line.Invoke(host,new object[]{"[SignonState] Client 0 'test' signon state SIGNONSTATE_SPAWN -> SIGNONSTATE_NONE"});
            if(host.HostInGame)throw new Exception("Disconnect-time Adding player must never count as successful entry");
            Console.WriteLine("PASS disconnect cannot masquerade as client entry");
            line.Invoke(host,new object[]{"Accepting Steam Net connection #3 UDP steamid:76561197960266962@127.0.0.1:12345"});
            line.Invoke(host,new object[]{"CServerSideClientBase::Connect( name='test', userid=0, fake=0, connectiontypeflags=2, chan->addr=127.0.0.1:12345 )"});
            line.Invoke(host,new object[]{"[SignonState] Client 0 'test' signon state SIGNONSTATE_SPAWN -> SIGNONSTATE_FULL"});
            if(!host.HostInGame)throw new Exception("Only FULL signon must mark the mapped Steam account in game");
            Console.WriteLine("PASS FULL signon maps to the authenticated account");
            line.Invoke(host,new object[]{"[SignonState] Client 0 'test' signon state SIGNONSTATE_FULL -> SIGNONSTATE_NONE"});
            if(host.HostInGame)throw new Exception("Disconnected host must no longer be in game");
            Console.WriteLine("PASS disconnect clears in-game status");
            if(!MacInstall.IsShuttingDownLog("Source2Init OK\nMainLoop returning\nSource2Shutdown")||MacInstall.IsShuttingDownLog("Source2Shutdown\nSource2Init OK"))throw new Exception("Client lifecycle must distinguish shutdown from a later launch");
            Console.WriteLine("PASS client lifecycle rejects an exiting process");
            var root=Path.Combine(Path.GetTempPath(),"windymac-bundle-test-"+Guid.NewGuid().ToString("N"));
            try {
                var game=Path.Combine(root,"game");Directory.CreateDirectory(Path.Combine(game,"dota"));
                var exe=Path.Combine(root,"fake-dota");File.WriteAllText(exe,"test fixture");
                var marker=Path.Combine(game,"dota","keep.txt");File.WriteAllText(marker,"original game data");
                string bundle;
                using(var background=new DedicatedBundle(new MacInstall{Game=game,Exe=exe})) {
                    bundle=background.Folder;
                    if(!File.Exists(background.Exe)||!File.Exists(Path.Combine(bundle,"Contents","Info.plist")))throw new Exception("Missing runtime server bundle");
                }
                if(Directory.Exists(bundle)||File.ReadAllText(marker)!="original game data")throw new Exception("Bundle cleanup must preserve symlink targets");
                Console.WriteLine("PASS background bundle cleanup preserves installed game files");
            }finally{Directory.Delete(root,true);}
        }
    }
}
