import { ChallengeMetric, ChallengeScope, ChallengeUnit } from '../types/daily-challenge.types';

import { DailyChallengeGenerationService } from './daily-challenge-generation.service';

const task = (id: string, scope: ChallengeScope, category: string, weight = 1) => ({
  id,
  revision: 1,
  enabled: true,
  scope,
  metric: ChallengeMetric.HERO_DAMAGE,
  unit: ChallengeUnit.DAMAGE,
  category,
  title: { cn: id, en: id, ru: id },
  description: { cn: id, en: id, ru: id },
  target: 100,
  rewardSeasonPoint: 100,
  weight,
  expectedMatches: 2,
  cooldownDays: 0,
  minDataVersion: 1,
  groupTags: [],
  mutexTags: [],
  ...(scope === ChallengeScope.PERSONAL_HERO ? { heroName: `npc_dota_hero_${id}` } : {}),
});

const tasks = [
  task('damage-1', ChallengeScope.PERSONAL_GENERAL, 'damage', 10),
  task('damage-2', ChallengeScope.PERSONAL_GENERAL, 'damage', 5),
  task('healing-1', ChallengeScope.PERSONAL_GENERAL, 'healing', 10),
  task('tower-1', ChallengeScope.PERSONAL_GENERAL, 'tower', 3),
  task('hero-lina', ChallengeScope.PERSONAL_HERO, 'hero_damage', 10),
  task('hero-cm', ChallengeScope.PERSONAL_HERO, 'hero_control', 10),
  task('hero-axe', ChallengeScope.PERSONAL_HERO, 'hero_tank', 10),
  task('global-bots', ChallengeScope.GLOBAL, 'bot_kills', 10),
  task('global-roshan', ChallengeScope.GLOBAL, 'roshan_kills', 10),
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

  it('returns two different general categories and one hero task', () => {
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
    expect(result[0].category).not.toBe(result[1].category);
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

  it('uses cooldownDays when deciding which recent tasks remain excluded', () => {
    const cooling = task('cooling', ChallengeScope.PERSONAL_GENERAL, 'damage');
    const reusable = task('reusable', ChallengeScope.PERSONAL_GENERAL, 'damage');
    cooling.cooldownDays = 2;
    reusable.cooldownDays = 0;

    const pickWeighted = jest
      .spyOn(service as any, 'pickWeighted')
      .mockImplementation((pool: Array<{ id: string }>) => pool[0]);

    const result = (service as any).pickWithFallback(
      [cooling, reusable],
      'cooldown-seed',
      new Set<string>(),
      new Set<string>(['cooling', 'reusable']),
    );

    expect(result.id).toBe('reusable');
    expect(pickWeighted).toHaveBeenCalledWith([reusable], 'cooldown-seed');
    pickWeighted.mockRestore();
  });

  it('does not draw tasks that require a newer match contribution data version', () => {
    const futureGeneral = task(
      'future-general',
      ChallengeScope.PERSONAL_GENERAL,
      'future_damage',
      100000,
    );
    futureGeneral.minDataVersion = 3;
    const futureGlobal = task('future-global', ChallengeScope.GLOBAL, 'future_global', 100000);
    futureGlobal.minDataVersion = 3;

    const candidates = service.generatePlayerCandidates({
      dayId: '2026-08-04',
      steamId: 483215844,
      refreshIndex: 0,
      configVersion: 7,
      tasks: [...tasks, futureGeneral],
      seenTaskIds: [],
    });
    const global = service.generateGlobalTask('2026-08-04', 7, [...tasks, futureGlobal]);

    expect(candidates.map((item) => item.id)).not.toContain('future-general');
    expect(global.id).not.toBe('future-global');
  });

  it('selects a deterministic global task for a challenge day and config version', () => {
    const first = service.generateGlobalTask('2026-08-04', 7, tasks);
    const second = service.generateGlobalTask('2026-08-04', 7, tasks);

    expect(first).toEqual(second);
    expect(first.scope).toBe(ChallengeScope.GLOBAL);
  });

  it('draws dataVersion 2 tasks with the current generator', () => {
    const v2Tasks = tasks.map((item) => ({ ...item, minDataVersion: 2 }));

    expect(
      service.generatePlayerCandidates({
        dayId: '2026-08-04',
        steamId: 483215844,
        refreshIndex: 0,
        configVersion: 8,
        tasks: v2Tasks,
        seenTaskIds: [],
      }),
    ).toHaveLength(3);
    expect(service.generateGlobalTask('2026-08-04', 8, v2Tasks).scope).toBe(ChallengeScope.GLOBAL);
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
    } as any;

    const first = service.generatePlayerCandidates(input) as any[];
    const second = service.generatePlayerCandidates(input) as any[];

    expect(first).toEqual(second);
    expect(first).toHaveLength(3);
    expect(first[0].scope).toBe(ChallengeScope.PERSONAL_GENERAL);
    expect(first[1].scope).toBe(ChallengeScope.PERSONAL_GENERAL);
    expect(first[0].category).not.toBe(first[1].category);
    expect(first[2].scope).toBe(ChallengeScope.PERSONAL_HERO);
    expect(first.map((candidate) => candidate.star)).toEqual(
      expect.arrayContaining([expect.any(Number)]),
    );
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
        } as any)
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
    } as any) as any[];

    expect(result.map((candidate) => candidate.star)).toEqual([3, 3, 3]);
  });
});
