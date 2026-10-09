import { PlayerStatsRecentMatch } from './entities/player-stats-recent.entity';
import { DifficultyBaseline } from './entities/radar-baseline';
import { RADAR_MIN_MATCHES } from './player-stats-radar.constants';
import {
  PlayerStatsRadarService,
  buildRadar,
  nonZeroPercentileOf,
  percentileOf,
} from './player-stats-radar.service';

// 从 0 到 max 等距的 21 个分位点，中位数是 max / 2
function evenQuantiles(max: number): number[] {
  return Array.from({ length: 21 }, (_, i) => (max * i) / 20);
}

// 前一半的局没有治疗，有治疗的局每分钟 1–10
const halfZeroHealing = [...Array(11).fill(0), 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const baseline: DifficultyBaseline = {
  sampleCount: 500,
  damage: evenQuantiles(2000),
  gold: evenQuantiles(1000),
  participation: evenQuantiles(1),
  push: evenQuantiles(8),
  deaths: evenQuantiles(0.4),
  tank: evenQuantiles(600),
  healing: halfZeroHealing,
  assists: evenQuantiles(0.4),
  stuns: evenQuantiles(4),
};

// 10 分钟一局，各项正好是中位数
function medianMatch(overrides: Partial<PlayerStatsRecentMatch> = {}): PlayerStatsRecentMatch {
  return {
    difficulty: 5,
    durationSec: 600,
    isDisconnected: false,
    heroDamage: 10000,
    totalGoldEarned: 5000,
    kills: 3,
    assists: 2,
    deaths: 2,
    damageTaken: 3000,
    towerKills: 4,
    healing: 0,
    stuns: 20,
    ...overrides,
  } as PlayerStatsRecentMatch;
}

function repeat(match: PlayerStatsRecentMatch, count = RADAR_MIN_MATCHES) {
  return Array.from({ length: count }, () => match);
}

describe('percentileOf', () => {
  it('在相邻分位点之间线性插值，超出两端时取 0 或 100', () => {
    const quantiles = evenQuantiles(100);

    expect(percentileOf(50, quantiles)).toBe(50);
    expect(percentileOf(52.5, quantiles)).toBeCloseTo(52.5);
    expect(percentileOf(-1, quantiles)).toBe(0);
    expect(percentileOf(101, quantiles)).toBe(100);
  });

  it('多个分位点同值时取这一段的中间', () => {
    expect(percentileOf(0, halfZeroHealing)).toBe(25);
  });
});

describe('nonZeroPercentileOf', () => {
  it('0 记 0 分，大于 0 的值在非 0 的那一段里铺满 0–100', () => {
    expect(nonZeroPercentileOf(0, halfZeroHealing)).toBe(0);
    expect(nonZeroPercentileOf(5.5, halfZeroHealing)).toBeCloseTo(50);
    expect(nonZeroPercentileOf(10, halfZeroHealing)).toBe(100);
  });

  it('全体几乎都是 0 时，有一点治疗就是最高', () => {
    expect(nonZeroPercentileOf(1, [...Array(20).fill(0), 3])).toBe(100);
  });
});

describe('buildRadar', () => {
  it('每局都是中位数时各项都是 50，没有治疗的局治疗记 0', () => {
    const result = buildRadar(repeat(medianMatch()), { '5': baseline });

    expect(result.matchCount).toBe(RADAR_MIN_MATCHES);
    expect(result.radar).toEqual({
      damage: 50,
      gold: 50,
      participation: 50,
      push: 50,
      deaths: 50,
      tank: 50,
      healing: 0,
      assists: 50,
      stuns: 50,
    });
  });

  it('治疗各局平均后放大，封顶 100', () => {
    // 十局里一局治疗排在有治疗的局中间，平均 5 分，放大后 25
    const once = [medianMatch({ healing: 55 }), ...repeat(medianMatch(), RADAR_MIN_MATCHES - 1)];
    // 每局都是有治疗的局里的中位，放大后超过 100
    const always = repeat(medianMatch({ healing: 55 }));

    expect(buildRadar(once, { '5': baseline }).radar?.healing).toBe(25);
    expect(buildRadar(always, { '5': baseline }).radar?.healing).toBe(100);
  });

  it('伤害按每分钟比，推塔按每局比，死亡越少越高', () => {
    // 局长翻倍、总量翻倍：每分钟不变；推塔按局算翻倍；不死就是最高
    const match = medianMatch({
      durationSec: 1200,
      heroDamage: 20000,
      totalGoldEarned: 10000,
      kills: 6,
      assists: 4,
      deaths: 0,
      damageTaken: 6000,
      towerKills: 8,
    });

    const { radar } = buildRadar(repeat(match), { '5': baseline });

    expect(radar?.damage).toBe(50);
    expect(radar?.push).toBe(100);
    expect(radar?.deaths).toBe(100);
  });

  it('跳过掉线局、没有基准的难度与基准缺项的难度', () => {
    const { healing: _healing, ...withoutHealing } = baseline;
    const matches = [
      ...repeat(medianMatch(), RADAR_MIN_MATCHES - 1),
      medianMatch({ isDisconnected: true }),
      medianMatch({ difficulty: 8 }),
      medianMatch({ difficulty: 3 }),
    ];

    const result = buildRadar(matches, {
      '5': baseline,
      '3': withoutHealing as DifficultyBaseline,
    });

    expect(result.matchCount).toBe(RADAR_MIN_MATCHES - 1);
    expect(result.radar).toBeNull();
  });
});

describe('PlayerStatsRadarService.refreshBaseline', () => {
  function createService(rows: unknown[] | null) {
    const dailyStatsService = { save: jest.fn(), get: jest.fn() };
    const bigQueryService = { queryStatsBaseline: jest.fn().mockResolvedValue(rows) };
    const service = new PlayerStatsRadarService(
      dailyStatsService as never,
      bigQueryService as never,
      {} as never,
    );
    return { service, dailyStatsService };
  }

  it('丢掉样本不够的难度，整份写回每日统计', async () => {
    const { service, dailyStatsService } = createService([
      { difficulty: 5, sample_count: 500, ...baseline },
      { difficulty: 1, sample_count: 3, ...baseline },
    ]);

    await expect(service.refreshBaseline()).resolves.toEqual({ difficulties: 1 });

    const [id, saved] = dailyStatsService.save.mock.calls[0];
    expect(id).toBe('radarBaseline');
    expect(Object.keys(saved.difficulties)).toEqual(['5']);
    expect(saved.difficulties['5'].damage).toHaveLength(21);
  });

  it('未连 BigQuery 时什么都不写', async () => {
    const { service, dailyStatsService } = createService(null);

    await expect(service.refreshBaseline()).resolves.toBeNull();
    expect(dailyStatsService.save).not.toHaveBeenCalled();
  });
});
