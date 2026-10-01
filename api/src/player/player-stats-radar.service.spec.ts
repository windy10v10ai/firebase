import { PlayerStatsRecentMatch } from './entities/player-stats-recent.entity';
import { DifficultyBaseline } from './entities/radar-baseline';
import { RADAR_MIN_MATCHES } from './player-stats-radar.constants';
import { PlayerStatsRadarService, buildRadar, percentileOf } from './player-stats-radar.service';

// 从 0 到 max 等距的 21 个分位点，中位数是 max / 2
function evenQuantiles(max: number): number[] {
  return Array.from({ length: 21 }, (_, i) => (max * i) / 20);
}

const baseline: DifficultyBaseline = {
  sampleCount: 500,
  damage: evenQuantiles(2000),
  gold: evenQuantiles(1000),
  participation: evenQuantiles(1),
  survival: evenQuantiles(0.4),
  tank: evenQuantiles(600),
  push: evenQuantiles(8),
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
    // 前一半的人推塔为 0
    const quantiles = [...Array(11).fill(0), 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    expect(percentileOf(0, quantiles)).toBe(25);
  });
});

describe('buildRadar', () => {
  it('每局都是中位数时各项与综合评分都是 50', () => {
    const result = buildRadar(repeat(medianMatch()), { '5': baseline });

    expect(result.matchCount).toBe(RADAR_MIN_MATCHES);
    expect(result.radar).toEqual({
      score: 50,
      damage: 50,
      gold: 50,
      participation: 50,
      survival: 50,
      tank: 50,
      push: 50,
    });
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
    expect(radar?.survival).toBe(100);
  });

  it('跳过掉线局与没有基准的难度', () => {
    const matches = [
      ...repeat(medianMatch(), RADAR_MIN_MATCHES - 1),
      medianMatch({ isDisconnected: true }),
      medianMatch({ difficulty: 8 }),
    ];

    const result = buildRadar(matches, { '5': baseline });

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
