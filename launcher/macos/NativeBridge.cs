// GPL-3.0.
using System.Web.Script.Serialization;
namespace Windy10v10AI.Launcher {
    sealed class NativeBridge {
        readonly HostSession host=new(Program.Emit);
        readonly CancellationTokenSource updateCancel=new();
        Task update=Task.CompletedTask;
        public async Task<int> Run() {
            Console.CancelKeyPress+=(_,e)=>{e.Cancel=true;_=host.Stop();};
            Program.Emit(new{type="state",state="idle",message="准备好后创建房间，让朋友在 Windows 启动器输入房间码。",code="",log=""});
            try {
                string line;
                while((line=await Console.In.ReadLineAsync())!=null) {
                    try {
                        var command=(Dictionary<string,object>)new JavaScriptSerializer().DeserializeObject(line);
                        if(!await Execute(command))return 0;
                    }catch(Exception e){Program.Emit(new{type="message",message=e.Message});}
                }
            }finally{await Stop();}
            return 0;
        }
        async Task<bool> Execute(Dictionary<string,object> command) {
            switch(Convert.ToString(command.GetValueOrDefault("action"))) {
                case "open":Open(command);break;
                case "enter":host.Enter();break;
                case "next":host.Next(Convert.ToString(command.GetValueOrDefault("mode","easy")));break;
                case "stop":Program.Emit(new{type="state",state="stopping",message="正在关闭房间…",code=host.Code??"",log=host.ServerLog??""});await host.Stop();break;
                case "inspect":Program.Emit(new{type="inspection",details=MacInstall.Find().Inspect()});break;
                case "update":Update();break;
                case "quit":await Stop();return false;
                default:throw new Exception("未知操作。");
            }
            return true;
        }
        void Open(Dictionary<string,object> command) {
            if(!update.IsCompleted)throw new Exception("请等待地图更新完成。");
            host.Start(Convert.ToString(command.GetValueOrDefault("mode","easy")),Convert.ToInt32(command.GetValueOrDefault("maxPlayers",10)),true.Equals(command.GetValueOrDefault("autoEnter",true)));
        }
        void Update() {
            if(!update.IsCompleted)return;
            if(!new[]{"idle","error"}.Contains(host.State))throw new Exception("请先关闭房间再更新地图。");
            update=Workshop.Update(Program.Emit,updateCancel.Token);
        }
        async Task Stop() {updateCancel.Cancel();await update;await host.Stop();}
    }
}
