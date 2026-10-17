// GPL-3.0.
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using Windy10v10AI.Launcher.Tests;
namespace Windy10v10AI.Launcher {
    static class IntegrationTests {
        static void Check(bool ok,string name) {if(!ok)throw new Exception("FAIL "+name);Console.WriteLine("PASS "+name);}
        static IPEndPoint Address(Tunnel t) {var socket=(UdpClient)typeof(Tunnel).GetField("Socket",BindingFlags.NonPublic|BindingFlags.Instance).GetValue(t);return new IPEndPoint(IPAddress.Loopback,((IPEndPoint)socket.Client.LocalEndPoint).Port);}
        static async Task Wait(Func<bool> condition,int seconds,string message) {var deadline=DateTime.UtcNow.AddSeconds(seconds);while(DateTime.UtcNow<deadline) {if(condition())return;await Task.Delay(100);}throw new Exception("TIMEOUT "+message);}
        public static async Task<int> Run() {
            try {
                SignonTests.RunAll();LocalGateTests.RunAll();RelayTests.RunAll();
                // 动态端口使离线校验可与玩家房间同时运行。
                using var fakeServer=new UdpClient(new IPEndPoint(IPAddress.Loopback,0));
                using var host=new HostTunnel(((IPEndPoint)fakeServer.Client.LocalEndPoint).Port){GameReady=false};using var join=new JoinTunnel();
                host.RosterSource=()=>new List<RosterEntry>{new(){SteamId=123,Name="测试房主",IsHost=true,Status=PlayerStatus.InGame}};
                host.Start();join.Start();
                string token=Guid.NewGuid().ToString("N");
                host.AddJoin("offline",token,new List<Candidate>{new("lan",Address(join))},false,null);
                var path=join.Connect(token,new List<Candidate>{new("lan",Address(host))},null);
                Check(path=="lan","upstream host/join handshake");
                await Wait(()=>join.HasRoster,5,"roster");Check(join.Roster().Any(r=>r.Name=="测试房主"&&r.IsHost),"UTF-8 roster interoperability");
                Check(!join.GameReady,"first-game host readiness");host.GameReady=true;await Wait(()=>join.GameReady,5,"first-game ready");
                join.Forward(0);using var client=new UdpClient(new IPEndPoint(IPAddress.Loopback,0));
                var local=(UdpClient)typeof(JoinTunnel).GetField("local",BindingFlags.NonPublic|BindingFlags.Instance).GetValue(join);
                var payload=Encoding.ASCII.GetBytes("game-payload");await client.SendAsync(payload,payload.Length,(IPEndPoint)local.Client.LocalEndPoint);
                var received=await fakeServer.ReceiveAsync().WaitAsync(TimeSpan.FromSeconds(3));Check(received.Buffer.SequenceEqual(payload),"join-to-host game datagrams");
                var reply=Encoding.ASCII.GetBytes("server-reply");await fakeServer.SendAsync(reply,reply.Length,received.RemoteEndPoint);
                var answer=await client.ReceiveAsync().WaitAsync(TimeSpan.FromSeconds(3));Check(answer.Buffer.SequenceEqual(reply),"host-to-join game datagrams");
                host.Game=2;host.GameReady=false;
                await Wait(()=>join.Game==2,5,"next game");Check(!join.GameReady,"next-game readiness encoding");
                host.GameReady=true;await Wait(()=>join.GameReady,5,"next game ready");
                host.GameEnded=true;await Wait(()=>join.GameEnded,5,"game ended");Check(join.GameEnded,"end-of-game notification");
                host.Kick("offline");await Wait(()=>join.Kicked,2,"kick");Check(join.Kicked,"kick notification");
                // JSON 适配层必须保持协议数据形状，避免破坏跨平台互通。
                var d=(Dictionary<string,object>)new System.Web.Script.Serialization.JavaScriptSerializer().DeserializeObject("{\"steamId\":123,\"joins\":[{\"probe\":false}],\"symmetricNat\":null}");
                Check(Convert.ToInt64(d["steamId"])==123&&d["joins"] is object[],"JSON compatibility adapter");
                Console.WriteLine("ALL OFFLINE TESTS PASSED");return 0;
            } catch(Exception e) {Console.Error.WriteLine(e);return 1;}
        }
        public static async Task<int> Transport() {
            using var host=new HostTunnel();using var stop=new CancellationTokenSource();
            using var fakeServer=new UdpClient(new IPEndPoint(IPAddress.Loopback,27015));
            string code=null,token=null;Dictionary<string,object> baseBody=null;Task poll=Task.CompletedTask;
            try {
                var install=MacInstall.Find();var candidates=host.Gather(out var publicIp);
                baseBody=HostSession.PeerBody(install,candidates,host.SymmetricNat);
                baseBody["publicIp"]=publicIp;baseBody["public"]=false;baseBody["maxPlayers"]=2;baseBody["playerCount"]=1;baseBody["map"]="easy";
                var opened=RoomApi.Host(baseBody);code=(string)opened["code"];token=(string)opened["token"];
                host.RosterSource=()=>new List<RosterEntry>{new(){SteamId=MacInstall.AccountId(),Name="Mac transport test",IsHost=true,Status=PlayerStatus.InRoom}};
                host.Start();var seen=new HashSet<string>();
                poll=Task.Run(async()=> {
                    while(!stop.IsCancellationRequested) {
                        try {
                            var b=new Dictionary<string,object>(baseBody){["code"]=code,["token"]=token};
                            var answer=RoomApi.Host(b);
                            foreach(Dictionary<string,object> join in (object[])answer["joins"]) {
                                if(!seen.Add((string)join["joinId"]))continue;
                                host.AddJoin((string)join["joinId"],(string)join["joinToken"],((object[])join["candidates"]).Select(x=>Candidate.Parse((string)x)).ToList(),false,RelayTicket.Read(join));
                            }
                        }catch(Exception e){Console.WriteLine("Poll: "+e.Message);}
                        try{await Task.Delay(1000,stop.Token);}catch(OperationCanceledException){}
                    }
                });
                foreach(bool relay in new[]{false,true}) {
                    using var join=new JoinTunnel();var own=join.Gather(out _);join.Start();
                    var answer=RoomApi.Join(code,HostSession.PeerBody(install,own,join.SymmetricNat));
                    JoinTunnel.RelayOnly=relay;
                    var path=join.Connect((string)answer["joinToken"],((object[])answer["hostCandidates"]).Select(x=>Candidate.Parse((string)x)).ToList(),RelayTicket.Read(answer));
                    Check(path!=null&&(!relay||path=="relay"),relay?"real signed relay handshake":"real room API and guest handshake ("+path+")");
                    await Wait(()=>join.HasRoster,8,"real-service roster");Check(join.Roster().Any(x=>x.IsHost),"real-service roster delivery");
                    join.Forward(28016);using var game=new UdpClient(new IPEndPoint(IPAddress.Loopback,0));
                    var payload=Encoding.ASCII.GetBytes("windymac-real-route-test");
                    await game.SendAsync(payload,payload.Length,new IPEndPoint(IPAddress.Loopback,28016));
                    var packet=await fakeServer.ReceiveAsync().WaitAsync(TimeSpan.FromSeconds(5));Check(packet.Buffer.SequenceEqual(payload),"real-route guest-to-host payload");
                    await fakeServer.SendAsync(packet.Buffer,packet.Buffer.Length,packet.RemoteEndPoint);
                    var response=await game.ReceiveAsync().WaitAsync(TimeSpan.FromSeconds(5));Check(response.Buffer.SequenceEqual(payload),"real-route host-to-guest payload");
                }
                Console.WriteLine("TRANSPORT TEST PASSED; no game server or remote Windows machine used");return 0;
            }catch(Exception e){Console.Error.WriteLine(e);return 1;}
            finally {
                JoinTunnel.RelayOnly=false;stop.Cancel();await poll;
                if(code!=null)try{var b=new Dictionary<string,object>(baseBody){["code"]=code,["token"]=token,["started"]=true,["ended"]=true};RoomApi.Host(b);}catch{}
            }
        }
        public static async Task<int> Live(bool enterClient,bool skipLatest=false) {
            var host=new HostSession(Program.Emit){LocalTestSkipLatestCheck=skipLatest};
            try {
                host.Start("easy",10,false);
                await Wait(()=>host.Ready||host.State=="error",180,"server ready");
                Check(host.Ready,"actual macOS map server ready");
                var install=MacInstall.Find();
                VerifyRoomProbe(host,install);
                await VerifyGuestPaths(host,install);
                JoinTunnel.RelayOnly=false;
                if(enterClient)await VerifyClient(host);
                Console.WriteLine("LIVE TEST PASSED (same Mac; not a remote Windows end-to-end game)");return 0;
            } catch(Exception e) {Console.Error.WriteLine(e);return 1;}
            finally {JoinTunnel.RelayOnly=false;await host.Stop();}
        }
        static void VerifyRoomProbe(HostSession host,MacInstall install) {
            using(var probe=new JoinTunnel()) {
                var candidates=probe.Gather(out _);probe.Start();
                var body=HostSession.PeerBody(install,candidates,probe.SymmetricNat);body["probe"]=true;
                var answer=RoomApi.Join(host.Code,body);
                int rtt=probe.Measure((string)answer["joinToken"],((object[])answer["hostCandidates"]).Select(x=>Candidate.Parse((string)x)).ToList());
                Check(rtt>=0,"production room API and direct probe");
            }
        }
        static async Task VerifyGuestPaths(HostSession host,MacInstall install) {
            foreach(bool forceRelay in new[]{false,true}) {
                using var join=new JoinTunnel();var candidates=join.Gather(out _);join.Start();
                var answer=RoomApi.Join(host.Code,HostSession.PeerBody(install,candidates,join.SymmetricNat));
                JoinTunnel.RelayOnly=forceRelay;
                var path=join.Connect((string)answer["joinToken"],((object[])answer["hostCandidates"]).Select(x=>Candidate.Parse((string)x)).ToList(),RelayTicket.Read(answer));
                Check(path!=null&&(!forceRelay||path=="relay"),forceRelay?"production signed relay handshake":"production guest handshake");
                await Wait(()=>join.HasRoster,8,"live roster");Check(join.Roster().Any(r=>r.IsHost),"production guest receives roster");
            }
        }
        static async Task VerifyClient(HostSession host) {
            host.Enter();
            bool clientSeen=MacInstall.ClientRunning();
            var deadline=DateTime.UtcNow.AddSeconds(480);
            while(!host.HostInGame&&DateTime.UtcNow<deadline) {
                await Task.Delay(1000);
                bool running=MacInstall.ClientRunning();
                if(clientSeen&&!running)throw new Exception("Dota client exited before FULL signon; inspect client/crash logs");
                if(host.State=="error")throw new Exception("Host failed before client entry");
                clientSeen|=running;
            }
            Check(host.HostInGame,"actual Mac Dota client authenticated and entered server");
            for(int second=0;second<90;second++) {
                await Task.Delay(1000);
                Check(host.HostInGame&&MacInstall.ClientRunning(),"client remains connected "+(second+1)+"s");
            }
        }
    }
}
