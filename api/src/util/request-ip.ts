import { Request } from 'express';

// x-forwarded-for 取第一段。实测过这个 Cloud Function 收到的请求链路里，
// 最后一段是 Google 内部转发基础设施自己的 IP（同一个 Google LLC 地址段，
// 所有请求都一样，没有区分度），真实客户端 IP 在第一段。取不到时 fallback
// 到 req.ip。
export function getClientIp(req: Request): string {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
    return forwardedFor.split(',')[0].trim();
  }
  return req.ip ?? 'unknown';
}
