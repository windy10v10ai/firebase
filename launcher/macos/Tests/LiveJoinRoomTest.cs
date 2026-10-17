// GPL-3.0.
namespace Windy10v10AI.Launcher.Tests {
    static class LiveJoinRoomTest {
        sealed class NoMount:IDisposable {public void Dispose() {}}
        public static async Task<int> Run(string code) {
            // 网络验证与玩家当前的地图挂载、转发端口和客户端隔离。
            var options=new JoinSessionOptions {ForwardPort=0,Mount=_=>new NoMount()};
            var session=new JoinSession(Program.Emit,options);
            try {
                session.Start(code,false);
                var deadline=DateTime.UtcNow.AddSeconds(90);
                while(DateTime.UtcNow<deadline) {
                    if(session.Ready) {
                        Console.WriteLine("PASS real room API, host handshake, roster and game readiness; client was not launched");
                        await Task.Delay(2000);
                        if(!session.Ready)throw new Exception("房主状态在验证期间发生变化，请重试。");
                        return 0;
                    }
                    if(session.State=="error")return 1;
                    await Task.Delay(200);
                }
                throw new Exception("连接验证超时，请确认房主的服务器已准备好。");
            }catch(Exception e) {Console.Error.WriteLine(e.Message);return 1;}
            finally {await session.Stop();}
        }
    }
}
