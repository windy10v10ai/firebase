import { normalizeIp } from './ip.helper';

describe('normalizeIp', () => {
  it('IPv4 原样保留', () => {
    expect(normalizeIp('203.0.113.5')).toBe('203.0.113.5');
  });

  it('IPv4-mapped 形式还原成 IPv4', () => {
    expect(normalizeIp('::ffff:203.0.113.5')).toBe('203.0.113.5');
  });

  it('IPv6 截到 /64', () => {
    expect(normalizeIp('2400:4050:1234:5600:a1b2:c3d4:e5f6:7890')).toBe('2400:4050:1234:5600::');
  });

  it('同一 /64 内换地址归到同一条', () => {
    expect(normalizeIp('2400:4050:1234:5600:1111:2222:3333:4444')).toBe(
      normalizeIp('2400:4050:1234:5600:aaaa:bbbb:cccc:dddd'),
    );
  });

  it('压缩写法先展开再截断', () => {
    expect(normalizeIp('2001:db8::1')).toBe('2001:db8::');
    expect(normalizeIp('2400:4050:1234:0:aaaa::1')).toBe('2400:4050:1234::');
    expect(normalizeIp('::1')).toBe('::');
  });

  it('前导零不影响结果', () => {
    expect(normalizeIp('2001:0db8:0000:0000:0000:ff00:0042:8329')).toBe('2001:db8::');
  });

  it('取不到地址时返回 undefined', () => {
    expect(normalizeIp(undefined)).toBeUndefined();
    expect(normalizeIp('   ')).toBeUndefined();
  });
});
