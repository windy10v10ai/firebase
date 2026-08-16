import { Request } from 'express';

import { getClientIp } from './request-ip';

function createRequest(headers: Record<string, string | undefined>, ip?: string): Request {
  return { headers, ip } as unknown as Request;
}

describe('getClientIp', () => {
  it('取 x-forwarded-for 的最后一段（GFE 追加、客户端改不了的那一跳）', () => {
    const req = createRequest({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' });

    expect(getClientIp(req)).toBe('5.6.7.8');
  });

  it('客户端自己伪造第一段也不影响结果，仍取最后一段', () => {
    const req = createRequest({ 'x-forwarded-for': 'fake-spoofed-value, 5.6.7.8' });

    expect(getClientIp(req)).toBe('5.6.7.8');
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
