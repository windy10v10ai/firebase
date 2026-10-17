// GPL-3.0.
using System.Text.Json;
using System.Web.Script.Serialization;
namespace Windy10v10AI.Launcher {
    static class Program {
        static readonly object output=new();
        public static void Emit(object value) {lock(output)Console.WriteLine(JsonSerializer.Serialize(value));}
        public static async Task<int> Main(string[] args) {
            if(args.Contains("--signon-test")){try{SignonTests.RunAll();return 0;}catch(Exception e){Console.Error.WriteLine(e);return 1;}}
            if(args.Contains("--self-test"))return await IntegrationTests.Run();
            if(args.Contains("--inspect")) {try{Emit(MacInstall.Find().Inspect());return 0;}catch(Exception e){Emit(new{error=e.Message});return 1;}}
            if(args.Contains("--transport-test"))return await IntegrationTests.Transport();
            if(args.Contains("--local-client-test"))return await IntegrationTests.Live(true,true);
            if(args.Contains("--live-test"))return await IntegrationTests.Live(args.Contains("--enter-client"));
            var host=new HostSession(Emit);
            Task update=Task.CompletedTask;var updateCancel=new CancellationTokenSource();
            Console.CancelKeyPress+=(_,e)=>{e.Cancel=true;_=host.Stop();};
            Emit(new{type="state",state="idle",message="准备好后创建房间，让朋友在 Windows 启动器输入房间码。",code="",log=""});
            try {
                string line;
                while((line=await Console.In.ReadLineAsync())!=null) {
                    try {
                        var cmd=(Dictionary<string,object>)new JavaScriptSerializer().DeserializeObject(line);
                        string action=Convert.ToString(cmd.GetValueOrDefault("action"));
                        switch(action) {
                            case "open": if(!update.IsCompleted)throw new Exception("请等待地图更新完成。");host.Start(Convert.ToString(cmd.GetValueOrDefault("mode","easy")),Convert.ToInt32(cmd.GetValueOrDefault("maxPlayers",10)),true.Equals(cmd.GetValueOrDefault("autoEnter",true)));break;
                            case "enter":host.Enter();break;
                            case "next":host.Next(Convert.ToString(cmd.GetValueOrDefault("mode","easy")));break;
                            case "stop":Emit(new{type="state",state="stopping",message="正在关闭房间…",code=host.Code??"",log=host.ServerLog??""});await host.Stop();break;
                            case "inspect":Emit(new{type="inspection",details=MacInstall.Find().Inspect()});break;
                            case "update":if(!update.IsCompleted)break;if(!new[]{"idle","error"}.Contains(host.State))throw new Exception("请先关闭房间再更新地图。");update=Workshop.Update(Emit,updateCancel.Token);break;
                            case "quit":updateCancel.Cancel();await update;await host.Stop();return 0;
                            default:throw new Exception("未知操作。");
                        }
                    }catch(Exception e){Emit(new{type="message",message=e.Message});}
                }
            }finally{updateCancel.Cancel();await update;await host.Stop();}
            return 0;
        }
    }
}
