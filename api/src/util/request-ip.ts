import { Request } from 'express';

// Cloud Functions/Cloud Run 前面有 Google 的负载均衡，真实客户端 IP 在
// x-forwarded-for 的第一段；取不到时 fallback 到 req.ip。
export function getClientIp(req: Request): string {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
    return forwardedFor.split(',')[0].trim();
  }
  return req.ip ?? 'unknown';
}
