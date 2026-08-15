import { ChallengeMetric, ChallengeScope } from '../types/daily-challenge.types';

import { DailyChallengeGenerationService } from './daily-challenge-generation.service';

const task = (id: string, scope: ChallengeScope, metric: ChallengeMetric) => ({
  id,
  scope,
  metric,
  target: 100,
  ...(scope === ChallengeScope.PERSONAL_HERO ? { heroName: `npc_dota_hero_${id}` } : {}),
});

const tasks = [
  task('damage-1', ChallengeScope.PERSONAL_GENERAL, ChallengeMetric.HERO_DAMAGE),
  task('damage-2', ChallengeScope.PERSONAL_GENERAL, ChallengeMetric.PHYSICAL_DAMAGE),
  task('healing-1', ChallengeScope.PERSONAL_GENERAL, ChallengeMetric.HEALING),
  task('tower-1', ChallengeScope.PERSONAL_GENERAL, ChallengeMetric.TOWER_KILLS),
  task('hero-lina', ChallengeScope.PERSONAL_HERO, ChallengeMetric.HERO_DAMAGE),
  task('hero-cm', ChallengeScope.PERSONAL_HERO, ChallengeMetric.STUN_DURATION_MS),
  task('hero-axe', ChallengeScope.PERSONAL_HERO, ChallengeMetric.DAMAGE_TAKEN),
  task('global-bots', ChallengeScope.GLOBAL, ChallengeMetric.BOT_KILLS),
  task('global-roshan', ChallengeScope.GLOBAL, ChallengeMetric.ROSHAN_KILLS),
];

describe('DailyChallengeGenerationService', () => {
  const service = new DailyChallengeGenerationService();

  it('rebuilds the same three candidates from the same stable seed', () => {
    const input = {
      dayId: '2026-08-04',
      steamId: 483215844,
      refreshIndex: 0,
      configVersion: 7,
      tasks,
      seenTaskIds: [],
    };

    expect(service.generatePlayerCandidates(input)).toEqual(
      service.generatePlayerCandidates(input),
    );
  });

  it('returns two different general metric categories and one hero task', () => {
    const result = service.generatePlayerCandidates({
      dayId: '2026-08-04',
      steamId: 483215844,
      refreshIndex: 0,
      configVersion: 7,
      tasks,
      seenTaskIds: [],
    });

    expect(result).toHaveLength(3);
    expect(result[0].scope).toBe(ChallengeScope.PERSONAL_GENERAL);
    expect(result[1].scope).toBe(ChallengeScope.PERSONAL_GENERAL);
    expect(result[0].metric).not.toBe(result[1].metric);
    expect(result[2].scope).toBe(ChallengeScope.PERSONAL_HERO);
  });

  it('changes the stable candidate set after refresh and prefers unseen tasks', () => {
    const first = service.generatePlayerCandidates({
      dayId: '2026-08-04',
      steamId: 483215844,
      refreshIndex: 0,
      configVersion: 7,
      tasks,
      seenTaskIds: [],
    });
    const refreshed = service.generatePlayerCandidates({
      dayId: '2026-08-04',
      steamId: 483215844,
      refreshIndex: 1,
      configVersion: 7,
      tasks,
      seenTaskIds: first.map((item) => item.id),
    });

    expect(refreshed.map((item) => item.id)).not.toEqual(first.map((item) => item.id));
    expect(refreshed.every((item) => !first.some((old) => old.id === item.id))).toBe(true);
  });

  it('falls back to seen tasks after the matching pool is exhausted', () => {
    const result = service.generatePlayerCandidates({
      dayId: '2026-08-04',
      steamId: 483215844,
      refreshIndex: 2,
      configVersion: 7,
      tasks,
      seenTaskIds: tasks.map((item) => item.id),
    });

    expect(result).toHaveLength(3);
  });

  it('selects a deterministic global task for a challenge day and config version', () => {
    const first = service.generateGlobalTask('2026-08-04', 7, tasks);
    const second = service.generateGlobalTask('2026-08-04', 7, tasks);

    expect(first).toEqual(second);
    expect(first.scope).toBe(ChallengeScope.GLOBAL);
  });

  it('assigns each candidate an independently deterministic star while preserving 2 general + 1 hero', () => {
    const input = {
      dayId: '2026-08-04',
      steamId: 483215844,
      currentRound: 2,
      refreshIndex: 3,
      configVersion: 7,
      tasks,
      seenTaskIds: [],
      personalStarWeights: { 1: 1, 2: 1, 3: 1 },
    };

    const first = service.generatePlayerCandidates(input);
    const second = service.generatePlayerCandidates(input);

    expect(first).toEqual(second);
    expect(first).toHaveLength(3);
    expect(first[0].scope).toBe(ChallengeScope.PERSONAL_GENERAL);
    expect(first[1].scope).toBe(ChallengeScope.PERSONAL_GENERAL);
    expect(first[0].metric).not.toBe(first[1].metric);
    expect(first[2].scope).toBe(ChallengeScope.PERSONAL_HERO);
    expect(first.every((candidate) => [1, 2, 3].includes(candidate.star))).toBe(true);
  });

  it('can produce mixed candidate stars across independently seeded slots', () => {
    const sampledStars = Array.from({ length: 20 }, (_, offset) =>
      service
        .generatePlayerCandidates({
          dayId: `2026-08-${String(offset + 1).padStart(2, '0')}`,
          steamId: 483215844,
          currentRound: 1,
          refreshIndex: 0,
          configVersion: 7,
          tasks,
          seenTaskIds: [],
          personalStarWeights: { 1: 1, 2: 1, 3: 1 },
        })
        .map((candidate) => candidate.star),
    );

    expect(sampledStars.some((stars) => new Set(stars).size > 1)).toBe(true);
  });

  it('allows all three candidates to receive the same star when configured weights select it', () => {
    const result = service.generatePlayerCandidates({
      dayId: '2026-08-04',
      steamId: 483215844,
      currentRound: 1,
      refreshIndex: 0,
      configVersion: 7,
      tasks,
      seenTaskIds: [],
      personalStarWeights: { 1: 0, 2: 0, 3: 10 },
    });

    expect(result.map((candidate) => candidate.star)).toEqual([3, 3, 3]);
  });

  it('uses the current round in the stable seed', () => {
    const firstRound = service.generatePlayerCandidates({
      dayId: '2026-08-04',
      steamId: 483215844,
      currentRound: 1,
      refreshIndex: 0,
      configVersion: 7,
      tasks,
      seenTaskIds: [],
    });
    const secondRound = service.generatePlayerCandidates({
      dayId: '2026-08-04',
      steamId: 483215844,
      currentRound: 2,
      refreshIndex: 0,
      configVersion: 7,
      tasks,
      seenTaskIds: [],
    });

    expect(secondRound).not.toEqual(firstRound);
  });
});
