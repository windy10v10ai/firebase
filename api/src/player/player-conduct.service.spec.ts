import { PlayerConductService } from './player-conduct.service';

describe('PlayerConductService.calculateGameEndConductPoint', () => {
  const service = new PlayerConductService(null, null);

  it.each([
    [100, false, 100], // >= 100 不加
    [99, false, 100],
    [0, false, 1],
    [50, true, 40],
    [5, true, 0], // 下限
    [120, true, 110],
    [110, false, 110], // >= 100 不加
    [120, false, 120], // 上限不变
    [3, true, 0], // 负数 clamp 到 0
  ])(
    'current=%i isDisconnect=%s -> %i',
    (current: number, isDisconnect: boolean, expected: number) => {
      expect(service.calculateGameEndConductPoint(current, isDisconnect)).toBe(expected);
    },
  );
});

describe('PlayerConductService.clampConductPoint', () => {
  const service = new PlayerConductService(null, null);

  it.each([
    [-5, 0],
    [0, 0],
    [50, 50],
    [120, 120],
    [150, 120],
  ])('clamp %i -> %i', (input: number, expected: number) => {
    expect(service.clampConductPoint(input)).toBe(expected);
  });
});
