import { Request } from 'express';

import { getClientIp } from './request-ip';

function createRequest(headers: Record<string, string | undefined>, ip?: string): Request {
  return { headers, ip } as unknown as Request;
}

describe('getClientIp', () => {
  it('优先取 cf-connecting-ip（Cloudflare 边缘节点写入，不可伪造）', () => {
    const req = createRequest({
      'cf-connecting-ip': '1.2.3.4',
      'x-forwarded-for': '172.68.87.219',
    });

    expect(getClientIp(req)).toBe('1.2.3.4');
  });

  it('没有 cf-connecting-ip 时 fallback 到 x-forwarded-for 第一段', () => {
    const req = createRequest({ 'x-forwarded-for': '1.2.3.4, 66.249.82.196' });

    expect(getClientIp(req)).toBe('1.2.3.4');
  });

  it('x-forwarded-for 只有一个地址时去掉多余空格', () => {
    const req = createRequest({ 'x-forwarded-for': ' 1.2.3.4 ' });

    expect(getClientIp(req)).toBe('1.2.3.4');
  });

  it('都没有时 fallback 到 req.ip', () => {
    const req = createRequest({}, '9.9.9.9');

    expect(getClientIp(req)).toBe('9.9.9.9');
  });

  it('全部都没有时返回 unknown', () => {
    const req = createRequest({}, undefined);

    expect(getClientIp(req)).toBe('unknown');
  });
});
