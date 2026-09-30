import { PlayerStatsRecentMatch } from './entities/player-stats-recent.entity';
import { DifficultyBaseline } from './entities/stats-baseline.entity';
import { RADAR_MIN_MATCHES } from './player-stats-radar.constants';
import { PlayerStatsRadarService, buildRadar } from './player-stats-radar.service';

const baseline: DifficultyBaseline = {
  sampleCount: 500,
  damage: 1000,
  gold: 500,
  participation: 0.5,
  survival: 0.2,
  tank: 300,
  push: 4,
};

// 10 分钟一局，各项正好是基准，比值全为 1
function averageMatch(overrides: Partial<PlayerStatsRecentMatch> = {}): PlayerStatsRecentMatch {
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

describe('buildRadar', () => {
  it('scores 100 when every match equals the baseline', () => {
    const result = buildRadar(repeat(averageMatch()), { '5': baseline });

    expect(result.matchCount).toBe(RADAR_MIN_MATCHES);
    expect(result.radar).toEqual({
      score: 100,
      damage: 1,
      gold: 1,
      participation: 1,
      survival: 1,
      tank: 1,
      push: 1,
    });
  });

  it('compares damage per minute but towers per match', () => {
    // 局长翻倍、总量翻倍：每分钟不变，推塔按局算翻倍
    const match = averageMatch({
      durationSec: 1200,
      heroDamage: 20000,
      totalGoldEarned: 10000,
      kills: 6,
      assists: 4,
      deaths: 4,
      damageTaken: 6000,
      towerKills: 8,
    });

    const { radar } = buildRadar(repeat(match), { '5': baseline });

    expect(radar?.damage).toBe(1);
    expect(radar?.push).toBe(2);
  });

  it('rewards fewer deaths and caps each match at the ratio cap', () => {
    const { radar } = buildRadar(repeat(averageMatch({ deaths: 0, heroDamage: 100000 })), {
      '5': baseline,
    });

    expect(radar?.survival).toBe(2);
    expect(radar?.damage).toBe(2);
  });

  it('skips disconnected matches and difficulties without a baseline', () => {
    const matches = [
      ...repeat(averageMatch(), RADAR_MIN_MATCHES - 1),
      averageMatch({ isDisconnected: true }),
      averageMatch({ difficulty: 8 }),
    ];

    const result = buildRadar(matches, { '5': baseline });

    expect(result.matchCount).toBe(RADAR_MIN_MATCHES - 1);
    expect(result.radar).toBeNull();
  });
});

describe('PlayerStatsRadarService.refreshBaseline', () => {
  function createService(rows: unknown[] | null) {
    const baselineRepository = { create: jest.fn(), findById: jest.fn() };
    const bigQueryService = { queryStatsBaseline: jest.fn().mockResolvedValue(rows) };
    const service = new PlayerStatsRadarService(
      baselineRepository as never,
      bigQueryService as never,
      {} as never,
    );
    return { service, baselineRepository };
  }

  it('drops difficulties with too few samples and overwrites the baseline document', async () => {
    const { service, baselineRepository } = createService([
      { difficulty: 5, sample_count: 500, ...baseline },
      { difficulty: 1, sample_count: 3, ...baseline },
    ]);

    await expect(service.refreshBaseline()).resolves.toEqual({ difficulties: 1 });

    const saved = baselineRepository.create.mock.calls[0][0];
    expect(Object.keys(saved.difficulties)).toEqual(['5']);
    expect(saved.difficulties['5'].sampleCount).toBe(500);
  });

  it('writes nothing when BigQuery is not configured', async () => {
    const { service, baselineRepository } = createService(null);

    await expect(service.refreshBaseline()).resolves.toBeNull();
    expect(baselineRepository.create).not.toHaveBeenCalled();
  });
});
