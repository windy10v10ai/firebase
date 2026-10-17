// GPL-3.0.
using System.Diagnostics;
namespace Windy10v10AI.Launcher {
    static class Workshop {
        public static async Task Update(Action<object> emit,CancellationToken ct) {
            try {
                emit(new{type="state",state="updating",message="正在通过 Steam 更新地图…",code="",log=""});
                var install=MacInstall.Find();
                var helper=Environment.GetEnvironmentVariable("WINDY_WORKSHOP_HELPER")??Path.GetFullPath(Path.Combine(AppContext.BaseDirectory,"../../MacOS/WorkshopUpdate"));
                if(!File.Exists(helper))throw new Exception("缺少地图更新工具，请重新解压完整应用。");
                var pi=new ProcessStartInfo(helper){UseShellExecute=false,RedirectStandardOutput=true,RedirectStandardError=true};
                pi.ArgumentList.Add(Path.Combine(install.Game,"bin/osx64/libsteam_api.dylib"));pi.ArgumentList.Add(MacInstall.MapId);
                using var p=Process.Start(pi);
                // 库诊断可能包含 Steam 身份信息，不能写入界面通信流。
                var stdout=p.StandardOutput.ReadToEndAsync();var stderr=p.StandardError.ReadToEndAsync();
                using var timeout=CancellationTokenSource.CreateLinkedTokenSource(ct);timeout.CancelAfter(TimeSpan.FromMinutes(11));
                try{await p.WaitForExitAsync(timeout.Token);}catch{if(!p.HasExited)p.Kill();throw;}
                await stdout;await stderr;
                if(p.ExitCode!=0)throw new Exception("Steam 未能完成地图更新。请确认 Steam 已登录，打开 Steam 的下载页面重试。");
                // Steam 异步释放辅助进程的游戏会话，启动客户端前需留出时间。
                await Task.Delay(5000,ct);
                emit(new{type="state",state="idle",message="Steam 地图更新检查已完成，可以创建或加入房间。",code="",log=""});
            }catch(OperationCanceledException){emit(new{type="state",state="idle",message="地图更新检查已停止。Steam 已排队的下载可能继续。",code="",log=""});}
            catch(Exception e){emit(new{type="state",state="error",message=e.Message,code="",log=""});}
        }
    }
}
