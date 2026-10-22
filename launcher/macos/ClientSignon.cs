// GPL-3.0.
// 玩家资源分配日志也会出现在断开连接时，只有完整登录状态能证明进图成功。
using System.Text.RegularExpressions;
namespace Windy10v10AI.Launcher {
    sealed class ClientSignon {
        readonly Dictionary<string,long> endpoints=new();
        readonly Dictionary<int,long> clients=new();
        public long? Left(string line) {
            var left=Regex.Match(line,@"\[SignonState\] Client (\d+) .* -> SIGNONSTATE_NONE\b");
            if(left.Success&&clients.Remove(int.Parse(left.Groups[1].Value),out var id))return id;
            return null;
        }
        public long? Entered(string line) {
            var accepted=Regex.Match(line,@"Accepting Steam Net connection .*steamid:(\d+)@([0-9.]+:\d+)");
            if(accepted.Success)endpoints[accepted.Groups[2].Value]=long.Parse(accepted.Groups[1].Value);
            var connected=Regex.Match(line,@"CServerSideClientBase::Connect\(.*userid=(\d+), fake=0,.*chan->addr=([0-9.]+:\d+)");
            if(connected.Success&&endpoints.TryGetValue(connected.Groups[2].Value,out var id))clients[int.Parse(connected.Groups[1].Value)]=id;
            var validated=Regex.Match(line,@"<([0-9]+)><\[U:1:([0-9]+)\]>.*STEAM USERID validated");
            if(validated.Success)clients[int.Parse(validated.Groups[1].Value)]=76561197960265728+long.Parse(validated.Groups[2].Value);
            var full=Regex.Match(line,@"\[SignonState\] Client (\d+) .* -> SIGNONSTATE_FULL\b");
            return full.Success&&clients.TryGetValue(int.Parse(full.Groups[1].Value),out var steamId)?steamId:null;
        }
    }
}
