// GPL-3.0.
using System.Web.Script.Serialization;
namespace Windy10v10AI.Launcher {
    sealed class NativeBridge {
        readonly HostSession host=new(Program.Emit);
        readonly JoinSession join=new(Program.Emit);
        readonly CancellationTokenSource updateCancel=new();
        Task update=Task.CompletedTask;
        string role;
        public async Task<int> Run() {
            Console.CancelKeyPress+=(_,e)=>{e.Cancel=true;_=Stop();};
            Program.Emit(new{type="state",state="idle",message="创建房间，或输入朋友的房间码加入。",code="",log=""});
            try {
                string line;
                while((line=await Console.In.ReadLineAsync())!=null) {
                    try {
                        var command=(Dictionary<string,object>)new JavaScriptSerializer().DeserializeObject(line);
                        if(!await Execute(command))return 0;
                    }catch(Exception e){Program.Emit(new{type="message",level="error",message=e.Message});}
                }
            }finally{await Stop();}
            return 0;
        }
        async Task<bool> Execute(Dictionary<string,object> command) {
            switch(Convert.ToString(command.GetValueOrDefault("action"))) {
                case "open":Open(command);break;
                case "join":Join(command);break;
                case "enter":Enter();break;
                case "next":Next(command);break;
                case "stop":await StopRoom();break;
                case "inspect":Program.Emit(new{type="inspection",details=MacInstall.Find().Inspect()});break;
                case "update":Update();break;
                case "quit":await Stop();return false;
                default:throw new Exception("未知操作。");
            }
            return true;
        }
        void Enter() {if(role=="join")join.Enter();else host.Enter();}
        void Next(Dictionary<string,object> command) {
            if(role!="host")throw new Exception("只有房主可以启动下一局。");
            host.Next(Convert.ToString(command.GetValueOrDefault("mode","easy")));
        }
        void CheckAvailable() {
            if(!update.IsCompleted)throw new Exception("请等待地图更新完成。");
            if(role=="join"&&!join.Active)role=null;
            if(role=="host"&&!host.Active)role=null;
            if(role!=null)throw new Exception("请先关闭或离开当前房间。");
        }
        void Open(Dictionary<string,object> command) {
            CheckAvailable();
            host.Start(Convert.ToString(command.GetValueOrDefault("mode","easy")),Convert.ToInt32(command.GetValueOrDefault("maxPlayers",10)),true.Equals(command.GetValueOrDefault("autoEnter",true)));
            role="host";
        }
        void Join(Dictionary<string,object> command) {
            CheckAvailable();
            join.Start(Convert.ToString(command.GetValueOrDefault("code","")),true.Equals(command.GetValueOrDefault("autoEnter",true)));
            role="join";
        }
        void Update() {
            if(!update.IsCompleted)return;
            CheckAvailable();
            update=Workshop.Update(Program.Emit,updateCancel.Token);
        }
        async Task StopRoom() {
            Program.Emit(new{type="state",role=role??"host",state="stopping",message=role=="join"?"正在离开房间…":"正在关闭房间…",code=(role=="join"?join.Code:host.Code)??"",log=role=="join"?"":host.ServerLog??""});
            if(role=="join")await join.Stop();else await host.Stop();
            role=null;
        }
        async Task Stop() {
            updateCancel.Cancel();
            try {await update;}finally {await Task.WhenAll(host.Stop(),join.Stop());role=null;}
        }
    }
}
