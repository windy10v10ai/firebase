import { Request } from 'express';

// 这个域名前面挂了 Cloudflare（客户端 → Cloudflare → Google Cloud Functions），
// 链路里有多层代理，x-forwarded-for 哪一段是真实客户端 IP 不好通过猜位置判断
// （实测过第一段和最后一段都出现过基础设施自己的 IP，不是客户端）。优先用
// Cloudflare 专门提供的 CF-Connecting-IP：由 Cloudflare 边缘节点根据实际连接
// 覆盖写入，客户端自己发的同名 header 会被 Cloudflare 丢弃，不可伪造。拿不到
// （比如请求没走 Cloudflare，直连 Cloud Function URL）时 fallback 到
// x-forwarded-for 第一段，都拿不到则 fallback 到 req.ip。
export function getClientIp(req: Request): string {
  const cfConnectingIp = req.headers['cf-connecting-ip'];
  if (typeof cfConnectingIp === 'string' && cfConnectingIp.length > 0) {
    return cfConnectingIp;
  }

  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
    return forwardedFor.split(',')[0].trim();
  }

  return req.ip ?? 'unknown';
}
