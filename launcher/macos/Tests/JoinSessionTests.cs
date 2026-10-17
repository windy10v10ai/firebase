// GPL-3.0.
using System.Collections.Concurrent;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text.Json;

namespace Windy10v10AI.Launcher.Tests {
    static class JoinSessionTests {
        static int checks;
        public static async Task RunAll() {
            checks=0;
            InvalidCodesDoNotStart();
            await Task.WhenAll(AutoEntryAcrossGames(),InitialEntryInLaterHostGame(),ManualEntryAndStop(),HostDeparture(false),HostDeparture(true),StopDuringRoomRequest(),BusinessErrors());
            Console.WriteLine($"PASS JoinSession tests ({checks} assertions)");
        }
        static void Check(bool condition,string message) {
            if(!condition)throw new Exception("JoinSession: "+message);
            Interlocked.Increment(ref checks);
        }
        static async Task Wait(Func<bool> condition,string message) {
            var deadline=DateTime.UtcNow.AddSeconds(7);
            while(DateTime.UtcNow<deadline) {
                if(condition())return;
                await Task.Delay(20);
            }
            throw new Exception("JoinSession timeout: "+message);
        }
        static void Reject(Action action,string message) {
            bool rejected=false;
            try {action();}catch(Exception) {rejected=true;}
            Check(rejected,message);
        }
        static void InvalidCodesDoNotStart() {
            var options=new JoinSessionOptions {FindInstall=()=>throw new Exception("must not inspect installation")};
            var session=new JoinSession(_=>{},options);
            foreach(var code in new[]{null,"","12345","1234567","AB-CD1","房间ABC1","ABＣ123"})
                Reject(()=>session.Start(code,true),"invalid room code rejected");
            Check(!session.Active&&session.State=="idle","invalid input leaves session idle");
        }
        static async Task AutoEntryAcrossGames() {
            await using var fixture=new Fixture();
            fixture.Session.Start("  ab12cd  ",true);
            await fixture.Waiting();
            Check(fixture.RequestCode=="AB12CD"&&fixture.Session.Code=="AB12CD","normalizes room code before request");
            Check(fixture.Events.Any(e=>Text(e,"state")=="joining"),"reports connecting state");
            Check(!fixture.Session.Ready&&fixture.Entries==0,"host not ready prevents automatic entry");
            Reject(fixture.Session.Enter,"manual entry waits for host readiness");
            Reject(()=>fixture.Session.Start("ZZ1234",true),"cannot replace an active room");
            fixture.Host.GameReady=true;
            await Wait(()=>fixture.Session.Ready&&fixture.Entries==1,"automatic first entry");
            await Task.Delay(300);
            Check(fixture.Entries==1,"automatic entry happens once while ready");
            fixture.Host.GameReady=false;
            await Wait(()=>!fixture.Session.Ready,"temporary readiness loss");
            fixture.Host.GameReady=true;
            await Wait(()=>fixture.Session.Ready,"readiness restored");
            await Task.Delay(100);
            Check(fixture.Entries==1,"readiness changes cannot automatically enter the same game twice");
            Check(fixture.Events.Any(e=>Text(e,"type")=="roster"&&e.GetProperty("players").EnumerateArray().Any(p=>Text(p,"name")=="离线房主")),"delivers real UTF-8 host roster");
            fixture.Host.GameEnded=true;
            await Wait(()=>fixture.Session.State=="ended","game end");
            Check(!fixture.Session.Ready,"ended game disables entry");
            Reject(fixture.Session.Enter,"cannot manually enter ended game");
            fixture.Host.GameReady=false;fixture.Host.GameEnded=false;fixture.Host.Game=2;
            await Wait(()=>fixture.Tunnel.Game==2&&fixture.Session.State=="waiting","next game waiting");
            Check(fixture.Entries==1,"next game waits for new readiness");
            fixture.Host.GameReady=true;
            await Wait(()=>fixture.Session.Ready&&fixture.Entries==2,"automatic next game entry");
            await Task.Delay(300);
            Check(fixture.Entries==2,"automatic next game entry happens once");
            await NextGameWithClosedClient(fixture);
            await GracefulHostClose(fixture);
        }
        static async Task NextGameWithClosedClient(Fixture fixture) {
            fixture.Options.ClientRunning=()=>false;
            fixture.Host.Game=3;
            await Wait(()=>fixture.Tunnel.Game==3&&fixture.Session.Ready,"next game without running client");
            await Task.Delay(100);
            Check(fixture.Entries==2,"next game cannot automatically restart an exited client");
            fixture.Session.Enter();
            await Wait(()=>fixture.Entries==3,"manual entry after client exited");
            Check(fixture.Entries==3,"manual entry remains available after client exited");
        }
        static async Task GracefulHostClose(Fixture fixture) {
            fixture.Host.GameEnded=true;
            await Wait(()=>fixture.Session.State=="ended","graceful close game end");
            fixture.Host.Dispose();
            await Wait(()=>!fixture.Session.Active,"graceful host close");
            Check(fixture.Session.State=="idle","host closure after game end is graceful");
            Check(fixture.Mount.Disposals==1&&!fixture.Session.Ready,"graceful host closure restores mount and readiness");
        }
        static async Task InitialEntryInLaterHostGame() {
            await using var fixture=new Fixture();
            fixture.Host.Game=3;fixture.Host.GameReady=true;
            fixture.Options.ClientRunning=()=>false;
            fixture.Session.Start("AB12CD",true);
            await Wait(()=>fixture.Session.Ready&&fixture.Entries==1,"initial entry into existing later host game");
            Check(fixture.Tunnel.Game==3&&fixture.Entries==1,"initial automatic entry starts client even when host is in a later game");
        }
        static async Task ManualEntryAndStop() {
            await using var fixture=new Fixture();
            fixture.BlockEntry=true;
            fixture.Session.Start("AB12CD",false);
            await fixture.Waiting();
            fixture.Host.GameReady=true;
            await Wait(()=>fixture.Session.Ready,"manual ready");
            Check(fixture.Entries==0,"manual mode does not enter automatically");
            await fixture.VerifyPayload();
            fixture.Session.Enter();
            await Wait(()=>fixture.Entries==1,"manual entry invoked");
            fixture.Session.Enter();
            await Task.Delay(100);
            Check(fixture.Entries==1,"entry cannot overlap an in-flight entry");
            await fixture.StopAndCheckPorts();
            Check(fixture.EntryCancelled,"stop cancels and awaits client entry");
            Reject(fixture.Session.Enter,"entry rejected after stop");
            await Task.Delay(150);
            Check(fixture.Entries==1,"no new entry after stop");
        }
        static async Task HostDeparture(bool kick) {
            await using var fixture=new Fixture();
            fixture.Host.GameReady=true;
            fixture.Session.Start("AB12CD",false);
            await Wait(()=>fixture.Session.Ready,"host departure ready");
            if(kick)fixture.Host.Kick("offline-session");else fixture.Host.Dispose();
            await Wait(()=>!fixture.Session.Active,"host departure cleanup");
            Check(fixture.Session.State=="error",kick?"kick reports an error":"host loss reports an error");
            string message=fixture.Events.Last(e=>Text(e,"type")=="state").GetProperty("message").GetString();
            Check(message.Contains(kick?"移出":"断开"),"host departure gives actionable message");
            Check(fixture.Mount.Disposals==1&&!fixture.Session.Ready,"host departure restores mount and readiness");
        }
        static async Task StopDuringRoomRequest() {
            await using var fixture=new Fixture();
            var requested=new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            var release=new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            fixture.Options.JoinRoom=(code,body)=> {requested.TrySetResult();release.Task.GetAwaiter().GetResult();return fixture.Answer(code,body);};
            fixture.Session.Start("AB12CD",true);
            await requested.Task.WaitAsync(TimeSpan.FromSeconds(5));
            try {
                await fixture.Session.Stop().WaitAsync(TimeSpan.FromSeconds(2));
                Check(!fixture.Session.Active&&fixture.Mount.Disposals==1,"stop cancels waiting room request and restores mount");
            }finally {release.TrySetResult();}
            await Task.Delay(100);
            Check(fixture.Entries==0&&fixture.Session.State=="idle","late API answer cannot restart stopped session");
        }
        static async Task BusinessErrors() {
            foreach(var pair in new[]{("room_not_found","找不到"),("room_full","已满"),("kicked","移出"),("map_mismatch","地图"),("version_mismatch","启动器"),("game_started","已开始"),("network","网络")}) {
                await using var fixture=new Fixture();
                fixture.Options.JoinRoom=(_,_)=>throw new RoomError(pair.Item1);
                fixture.Session.Start("AB12CD",true);
                await Wait(()=>fixture.Session.State=="error"&&!fixture.Session.Active,"business error "+pair.Item1);
                var last=fixture.Events.Last(e=>Text(e,"type")=="state");
                Check(Text(last,"message").Contains(pair.Item2),"maps business error "+pair.Item1);
                Check(fixture.Mount.Disposals==1&&fixture.Entries==0,"business error cleanup "+pair.Item1);
            }
        }
        static string Text(JsonElement value,string key)=>value.TryGetProperty(key,out var item)?item.GetString():null;
        static IPEndPoint Address(Tunnel tunnel) {
            var socket=(UdpClient)typeof(Tunnel).GetField("Socket",BindingFlags.NonPublic|BindingFlags.Instance).GetValue(tunnel);
            return new IPEndPoint(IPAddress.Loopback,((IPEndPoint)socket.Client.LocalEndPoint).Port);
        }
        sealed class FakeMount:IDisposable {
            public int Disposals;
            public void Dispose()=>Interlocked.Increment(ref Disposals);
        }
        sealed class Fixture:IAsyncDisposable {
            public readonly HostTunnel Host;
            public readonly JoinSessionOptions Options;
            public readonly JoinSession Session;
            public readonly FakeMount Mount=new();
            public readonly ConcurrentQueue<JsonElement> Events=new();
            readonly UdpClient server=new(new IPEndPoint(IPAddress.Loopback,0));
            readonly string token=Guid.NewGuid().ToString("N");
            public JoinTunnel Tunnel;
            public int Entries;
            public bool BlockEntry,EntryCancelled;
            public string RequestCode;
            public Fixture() {
                NativeMethods.KeepPrivate(server.Client);
                Host=new HostTunnel(((IPEndPoint)server.Client.LocalEndPoint).Port){GameReady=false};
                Host.RosterSource=()=>new List<RosterEntry>{new(){SteamId=123,Name="离线房主",IsHost=true,Status=PlayerStatus.InRoom}};
                Host.Start();
                Options=new JoinSessionOptions {
                    FindInstall=()=>new MacInstall {Manifest="offline-test"},AccountId=()=>456,
                    CreateTunnel=()=>Tunnel=new JoinTunnel(),
                    Gather=t=>new List<Candidate>{new("lan",Address(t))},
                    JoinRoom=Answer,Mount=_=>Mount,ClientRunning=()=>true,
                    ForwardPort=0,MonitorIntervalMs=20,
                    EnterClient=async(_,_,ct)=> {
                        ct.ThrowIfCancellationRequested();Interlocked.Increment(ref Entries);
                        if(BlockEntry)try {await Task.Delay(Timeout.Infinite,ct);}catch(OperationCanceledException) {EntryCancelled=true;throw;}
                    }
                };
                Session=new JoinSession(e=>Events.Enqueue(JsonSerializer.SerializeToElement(e)),Options);
            }
            public Dictionary<string,object> Answer(string code,Dictionary<string,object> body) {
                RequestCode=code;
                Check(Convert.ToInt64(body["steamId"])==456&&(string)body["mapVersion"]=="offline-test","request uses injected account and map version");
                var peers=((string[])body["candidates"]).Select(Candidate.Parse).ToList();
                Host.AddJoin("offline-session",token,peers,false,null);
                return new Dictionary<string,object> {
                    ["joinToken"]=token,["hostCandidates"]=new object[]{new Candidate("lan",Address(Host)).ToString()},
                    ["host"]=new Dictionary<string,object>{{"personaName","离线房主"}},
                    ["self"]=new Dictionary<string,object>{{"personaName","离线玩家"}}
                };
            }
            public async Task Waiting()=>await Wait(()=>Session.State=="waiting"&&Tunnel.HasRoster,"host-not-ready waiting");
            public async Task VerifyPayload() {
                var local=(UdpClient)typeof(JoinTunnel).GetField("local",BindingFlags.NonPublic|BindingFlags.Instance).GetValue(Tunnel);
                using var client=new UdpClient(new IPEndPoint(IPAddress.Loopback,0));
                NativeMethods.KeepPrivate(client.Client);
                var payload=new byte[]{31,65,0,255,78};
                await client.SendAsync(payload,payload.Length,(IPEndPoint)local.Client.LocalEndPoint);
                var received=await server.ReceiveAsync().WaitAsync(TimeSpan.FromSeconds(3));
                Check(received.Buffer.SequenceEqual(payload),"session forwards guest game packets to host");
                var reply=new byte[]{75,0,128,91};
                await server.SendAsync(reply,reply.Length,received.RemoteEndPoint);
                var answer=await client.ReceiveAsync().WaitAsync(TimeSpan.FromSeconds(3));
                Check(answer.Buffer.SequenceEqual(reply),"session forwards host game packets to guest");
            }
            public async Task StopAndCheckPorts() {
                int socketPort=Address(Tunnel).Port;
                var local=(UdpClient)typeof(JoinTunnel).GetField("local",BindingFlags.NonPublic|BindingFlags.Instance).GetValue(Tunnel);
                int forwardPort=((IPEndPoint)local.Client.LocalEndPoint).Port;
                await Session.Stop().WaitAsync(TimeSpan.FromSeconds(2));
                Check(!Session.Active&&Session.State=="idle"&&Session.Code==null&&!Session.Ready,"stop clears session state");
                Check(Mount.Disposals==1,"mount disposed exactly once");
                using var socketProbe=new UdpClient(new IPEndPoint(IPAddress.Any,socketPort));
                NativeMethods.KeepPrivate(socketProbe.Client);
                using var forwardProbe=new UdpClient(new IPEndPoint(IPAddress.Loopback,forwardPort));
                NativeMethods.KeepPrivate(forwardProbe.Client);
                Check(true,"stop releases tunnel and forwarding ports");
            }
            public async ValueTask DisposeAsync() {await Session.Stop();Host.Dispose();server.Dispose();}
        }
    }
}
