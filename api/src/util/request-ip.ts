import { Request } from 'express';

// x-forwarded-for 是链式追加的：客户端自己能在请求里填第一段（不可信，
// 可伪造），真正由 Google 基础设施（GFE）观察到的真实对端 IP 会被追加在
// 最后一段。这个 Cloud Function 是直接对外的 onRequest URL（没经过 Firebase
// Hosting 转发），中间只有 GFE 这一跳，所以取最后一段。取不到时 fallback 到
// req.ip。
export function getClientIp(req: Request): string {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
    const hops = forwardedFor.split(',').map((hop) => hop.trim());
    return hops[hops.length - 1];
  }
  return req.ip ?? 'unknown';
}
