import { DailyChallengeGlobalRewardTiers } from '../types/daily-challenge-config.types';
import { DailyChallengeContributionTier } from '../types/daily-challenge.types';

import { DailyChallengeGlobalRankingService } from './daily-challenge-global-ranking.service';

const tiers: DailyChallengeGlobalRewardTiers = {
  topPercent: 10,
  middlePercent: 30,
  topRewardSeasonPoint: 100,
  middleRewardSeasonPoint: 90,
  baseRewardSeasonPoint: 80,
};

const values = (...items: number[]) => items.map((value, index) => ({ steamId: index + 1, value }));

describe('DailyChallengeGlobalRankingService', () => {
  const service = new DailyChallengeGlobalRankingService();

  it('filters zero contributions and gives the only eligible player the top reward', () => {
    expect(service.rank(values(10, 0), tiers)).toEqual([
      {
        steamId: 1,
        value: 10,
        tier: DailyChallengeContributionTier.TOP,
        rewardSeasonPoint: 100,
      },
    ]);
  });

  it('uses one top and one middle seat for two eligible players', () => {
    expect(service.rank(values(20, 10), tiers).map(({ tier }) => tier)).toEqual([
      DailyChallengeContributionTier.TOP,
      DailyChallengeContributionTier.MIDDLE,
    ]);
  });

  it('uses one top, three middle, and five base seats for nine players', () => {
    const ranked = service.rank(values(90, 80, 70, 60, 50, 40, 30, 20, 10), tiers);

    expect(ranked.filter(({ tier }) => tier === DailyChallengeContributionTier.TOP)).toHaveLength(
      1,
    );
    expect(
      ranked.filter(({ tier }) => tier === DailyChallengeContributionTier.MIDDLE),
    ).toHaveLength(3);
    expect(ranked.filter(({ tier }) => tier === DailyChallengeContributionTier.BASE)).toHaveLength(
      5,
    );
  });

  it('uses one top, three middle, and six base seats for ten players', () => {
    const ranked = service.rank(values(100, 90, 80, 70, 60, 50, 40, 30, 20, 10), tiers);

    expect(ranked.map(({ tier }) => tier)).toEqual([
      DailyChallengeContributionTier.TOP,
      DailyChallengeContributionTier.MIDDLE,
      DailyChallengeContributionTier.MIDDLE,
      DailyChallengeContributionTier.MIDDLE,
      DailyChallengeContributionTier.BASE,
      DailyChallengeContributionTier.BASE,
      DailyChallengeContributionTier.BASE,
      DailyChallengeContributionTier.BASE,
      DailyChallengeContributionTier.BASE,
      DailyChallengeContributionTier.BASE,
    ]);
  });

  it('promotes every player tied at the top boundary into the top tier', () => {
    const ranked = service.rank(values(100, 90, 90, 80, 70, 60, 50, 40, 30, 20), {
      ...tiers,
      topPercent: 20,
    });

    expect(ranked.slice(0, 3).map(({ tier }) => tier)).toEqual([
      DailyChallengeContributionTier.TOP,
      DailyChallengeContributionTier.TOP,
      DailyChallengeContributionTier.TOP,
    ]);
  });

  it('promotes every player tied at the middle boundary into the middle tier', () => {
    const ranked = service.rank(values(100, 90, 80, 70, 70, 60, 50, 40, 30, 20), tiers);

    expect(ranked.slice(1, 5).map(({ tier }) => tier)).toEqual([
      DailyChallengeContributionTier.MIDDLE,
      DailyChallengeContributionTier.MIDDLE,
      DailyChallengeContributionTier.MIDDLE,
      DailyChallengeContributionTier.MIDDLE,
    ]);
  });

  it('puts all players in the top tier when every contribution is tied', () => {
    const ranked = service.rank(values(10, 10, 10, 10, 10, 10, 10, 10, 10, 10), tiers);

    expect(ranked.every(({ tier }) => tier === DailyChallengeContributionTier.TOP)).toBe(true);
  });

  it('uses steam id as a deterministic order for equal contributions', () => {
    const ranked = service.rank(
      [
        { steamId: 30, value: 10 },
        { steamId: 10, value: 10 },
        { steamId: 20, value: 10 },
      ],
      tiers,
    );

    expect(ranked.map(({ steamId }) => steamId)).toEqual([10, 20, 30]);
  });
});
