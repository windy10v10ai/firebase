import { Request } from 'express';

// 这个域名前面挂了 Cloudflare（客户端 → Cloudflare → Google Cloud Functions），
// 链路里有多层代理。x-forwarded-for 不可靠：实测过第一段、最后一段都出现过
// 基础设施自己的 IP（Cloudflare、Google 内部转发），不是客户端，没法靠猜位置
// 判断，所以不用它做 fallback。只信 Cloudflare 专门提供的 CF-Connecting-IP：
// 由 Cloudflare 边缘节点根据实际连接覆盖写入，客户端自己发的同名 header 会
// 被丢弃，不可伪造。拿不到时（比如请求没走 Cloudflare，直连 Cloud Function
// URL）直接返回 'unknown'，交给调用方按"拿不到真实 IP"处理，不再瞎猜。
export function getClientIp(req: Request): string {
  const cfConnectingIp = req.headers['cf-connecting-ip'];
  if (typeof cfConnectingIp === 'string' && cfConnectingIp.length > 0) {
    return cfConnectingIp;
  }
  return 'unknown';
}
