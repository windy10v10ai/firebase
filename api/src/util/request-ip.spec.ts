import { Request } from 'express';

import { getClientIp } from './request-ip';

function createRequest(headers: Record<string, string | undefined>, ip?: string): Request {
  return { headers, ip } as unknown as Request;
}

describe('getClientIp', () => {
  it('取 x-forwarded-for 的第一段（真实客户端 IP，最后一段是 Google 内部转发基础设施的 IP）', () => {
    const req = createRequest({ 'x-forwarded-for': '1.2.3.4, 66.249.82.196' });

    expect(getClientIp(req)).toBe('1.2.3.4');
  });

  it('x-forwarded-for 只有一个地址时去掉多余空格', () => {
    const req = createRequest({ 'x-forwarded-for': ' 1.2.3.4 ' });

    expect(getClientIp(req)).toBe('1.2.3.4');
  });

  it('没有 x-forwarded-for 时 fallback 到 req.ip', () => {
    const req = createRequest({}, '9.9.9.9');

    expect(getClientIp(req)).toBe('9.9.9.9');
  });

  it('两者都没有时返回 unknown', () => {
    const req = createRequest({}, undefined);

    expect(getClientIp(req)).toBe('unknown');
  });
});
