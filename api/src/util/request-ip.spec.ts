import { Request } from 'express';

import { getClientIp } from './request-ip';

function createRequest(headers: Record<string, string | undefined>): Request {
  return { headers } as unknown as Request;
}

describe('getClientIp', () => {
  it('取 cf-connecting-ip（Cloudflare 边缘节点写入，不可伪造）', () => {
    const req = createRequest({ 'cf-connecting-ip': '1.2.3.4' });

    expect(getClientIp(req)).toBe('1.2.3.4');
  });

  it('没有 cf-connecting-ip 时直接返回 unknown，不 fallback 到 x-forwarded-for', () => {
    const req = createRequest({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' });

    expect(getClientIp(req)).toBe('unknown');
  });

  it('什么 header 都没有时返回 unknown', () => {
    const req = createRequest({});

    expect(getClientIp(req)).toBe('unknown');
  });
});
