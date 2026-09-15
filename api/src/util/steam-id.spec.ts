import { toAccountId, toSteamId64 } from './steam-id';

describe('steam-id', () => {
  it('两个方向互为逆运算', () => {
    expect(toSteamId64(123456789)).toBe('76561198083722517');
    expect(toAccountId('76561198083722517')).toBe(123456789);
  });

  it('偏移量以下的 SteamID64 不是有效账号', () => {
    expect(toAccountId('76561197960265728')).toBeUndefined();
    expect(toAccountId('1')).toBeUndefined();
  });

  it('超出安全整数范围的 SteamID64 返回 undefined', () => {
    const tooLarge = (
      BigInt('76561197960265728') +
      BigInt(Number.MAX_SAFE_INTEGER) +
      BigInt(1)
    ).toString();
    expect(toAccountId(tooLarge)).toBeUndefined();
  });
});
