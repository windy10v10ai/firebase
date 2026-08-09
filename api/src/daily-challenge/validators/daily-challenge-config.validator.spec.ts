import { ChallengeMetric, ChallengeScope, ChallengeUnit } from '../types/daily-challenge.types';

import { DailyChallengeConfigValidator } from './daily-challenge-config.validator';

const makeTask = (overrides: Record<string, unknown> = {}) => ({
  id: 'general-damage-1',
  revision: 1,
  enabled: true,
  scope: ChallengeScope.PERSONAL_GENERAL,
  metric: ChallengeMetric.HERO_DAMAGE,
  unit: ChallengeUnit.DAMAGE,
  category: 'damage',
  title: { cn: '造成{target}伤害', en: 'Deal {target} damage', ru: 'Нанесите {target} урона' },
  description: {
    cn: '累计造成{target}伤害',
    en: 'Deal {target} total damage',
    ru: 'Нанесите всего {target} урона',
  },
  target: 500000,
  rewardSeasonPoint: 100,
  weight: 10,
  expectedMatches: 2,
  cooldownDays: 1,
  minDataVersion: 1,
  groupTags: ['damage'],
  mutexTags: [],
  ...overrides,
});

const makeConfig = () => ({
  id: 'config-v1',
  version: 1,
  tasks: [
    makeTask(),
    makeTask({
      id: 'general-healing-1',
      metric: ChallengeMetric.HEALING,
      category: 'healing',
      title: { cn: '治疗{target}', en: 'Heal {target}', ru: 'Исцелите {target}' },
      description: {
        cn: '累计治疗{target}',
        en: 'Restore {target} health',
        ru: 'Восстановите {target} здоровья',
      },
    }),
    makeTask({
      id: 'hero-lina-damage-1',
      scope: ChallengeScope.PERSONAL_HERO,
      category: 'hero_damage',
      heroName: 'npc_dota_hero_lina',
      title: {
        cn: '使用莉娜造成{target}伤害',
        en: 'Deal {target} damage as Lina',
        ru: 'Нанесите {target} урона за Лину',
      },
      description: {
        cn: '使用莉娜累计造成{target}伤害',
        en: 'Deal {target} total damage as Lina',
        ru: 'Нанесите всего {target} урона за Лину',
      },
    }),
    makeTask({
      id: 'global-tower-kills-1',
      scope: ChallengeScope.GLOBAL,
      metric: ChallengeMetric.TOWER_KILLS,
      unit: ChallengeUnit.COUNT,
      category: 'tower_kills',
      target: 10000,
      title: {
        cn: '全服击杀{target}个Bot',
        en: 'Defeat {target} Bots together',
        ru: 'Вместе победите {target} ботов',
      },
      description: {
        cn: '所有玩家共同击杀{target}个敌方Bot',
        en: 'All players defeat {target} enemy Bots',
        ru: 'Все игроки побеждают {target} вражеских ботов',
      },
    }),
  ],
  globalTargetPolicies: {
    'global-tower-kills-1': {
      launchTarget: 10000,
      minTarget: 5000,
      maxTarget: 50000,
      perPlayerExpectedContribution: 10,
      completionFactor: 0.75,
      maxDailyChangeRatio: 0.25,
    },
  },
  globalRewardTiers: {
    topPercent: 10,
    middlePercent: 30,
    topRewardSeasonPoint: 100,
    middleRewardSeasonPoint: 90,
    baseRewardSeasonPoint: 80,
  },
  refreshCostsMemberPoint: [10, 20, 30, 50, 50],
  streakMilestones: [
    { days: 3, rewardSeasonPoint: 50 },
    { days: 7, rewardSeasonPoint: 100 },
  ],
});

describe('DailyChallengeConfigValidator', () => {
  const validator = new DailyChallengeConfigValidator();

  it('accepts a publishable config with two general categories, a hero task and a global task', () => {
    expect(validator.validate(makeConfig())).toEqual([]);
  });
  it('rejects invalid global reward shares and rewards that increase in lower tiers', () => {
    const config = makeConfig();
    config.globalRewardTiers = {
      topPercent: 70,
      middlePercent: 30,
      topRewardSeasonPoint: 80,
      middleRewardSeasonPoint: 90,
      baseRewardSeasonPoint: 100,
    };

    expect(validator.validate(config)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'invalid_global_reward_tier_shares' }),
        expect.objectContaining({ code: 'invalid_global_reward_tier_rewards' }),
      ]),
    );
  });

  it('treats refresh costs as five paid refreshes because the free refresh is tracked separately', () => {
    const config = makeConfig();
    config.refreshCostsMemberPoint = [0, 10, 20, 30, 50, 50];

    expect(validator.validate(config)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'invalid_refresh_costs' })]),
    );
  });
  it('rejects configs without any streak milestones', () => {
    const config = makeConfig();
    config.streakMilestones = [];

    expect(validator.validate(config)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'invalid_streak_milestones' })]),
    );
  });

  it('rejects duplicate task ids and mismatched localization placeholders', () => {
    const config = makeConfig();
    config.tasks.push(
      makeTask({
        id: 'general-damage-1',
        title: { cn: '造成{target}伤害', en: 'Deal damage', ru: 'Нанесите {target} урона' },
      }),
    );

    const issues = validator.validate(config);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'duplicate_task_id', taskId: 'general-damage-1' }),
        expect.objectContaining({ code: 'placeholder_mismatch', taskId: 'general-damage-1' }),
      ]),
    );
  });

  it('rejects a task whose metric requires a newer contribution data version', () => {
    const config = makeConfig();
    config.tasks.push(
      makeTask({
        id: 'future-bot-kills',
        metric: ChallengeMetric.BOT_KILLS,
        category: 'bot_kills',
        minDataVersion: 1,
      }),
    );

    expect(validator.validate(config)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'metric_data_version_too_low',
          message: '指标 bot_kills 要求数据版本至少为 2',
          taskId: 'future-bot-kills',
        }),
      ]),
    );
  });

  it('allows future tasks to stay in the preset pool without counting them as current capacity', () => {
    const config = makeConfig();
    const heroTask = config.tasks.find((task) => task.scope === ChallengeScope.PERSONAL_HERO);
    if (!heroTask) throw new Error('missing hero task fixture');
    heroTask.minDataVersion = 3;

    expect(validator.validate(config)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'insufficient_hero_tasks' })]),
    );
    expect(validator.validate(config)).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'metric_data_version_too_low', taskId: heroTask.id }),
      ]),
    );
  });

  it('accepts a correctly versioned v2 metric while current tasks still satisfy capacity', () => {
    const config = makeConfig();
    config.tasks.push(
      makeTask({
        id: 'future-bot-kills',
        metric: ChallengeMetric.BOT_KILLS,
        unit: ChallengeUnit.COUNT,
        target: 100,
        category: 'bot_kills',
        minDataVersion: 2,
      }),
    );

    expect(validator.validate(config)).toEqual([]);
  });

  it('blocks hero pure-damage tasks without verified hero-ability evidence', () => {
    const config = makeConfig();
    config.tasks.push(
      makeTask({
        id: 'hero-pure-damage-1',
        scope: ChallengeScope.PERSONAL_HERO,
        metric: ChallengeMetric.PURE_DAMAGE,
        category: 'hero_pure_damage',
        heroName: 'npc_dota_hero_lina',
      }),
    );

    expect(validator.validate(config)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'missing_pure_damage_evidence',
          taskId: 'hero-pure-damage-1',
        }),
      ]),
    );
  });

  it('rejects availability windows that leave the published task pool without required capacity', () => {
    const config = makeConfig();
    (config.tasks as Array<Record<string, unknown>>).forEach((task) => {
      task.availableFrom = '2026-08-05';
    });

    expect(validator.validate(config)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'insufficient_task_pool_capacity' }),
      ]),
    );
  });

  it('returns shape issues instead of throwing when runtime config sections are missing', () => {
    const issues = validator.validate({} as never);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'invalid_tasks' }),
        expect.objectContaining({ code: 'invalid_global_target_policies' }),
        expect.objectContaining({ code: 'invalid_global_reward_tiers' }),
        expect.objectContaining({ code: 'invalid_refresh_costs_shape' }),
        expect.objectContaining({ code: 'invalid_streak_milestones_shape' }),
      ]),
    );
  });

  it('does not throw for malformed task and nested runtime values', () => {
    const config = makeConfig() as Record<string, unknown>;
    config.tasks = [
      null,
      {
        id: 'broken-task',
        scope: ChallengeScope.PERSONAL_HERO,
        metric: ChallengeMetric.PURE_DAMAGE,
        title: null,
        description: {},
        pureDamageEvidence: { heroName: 'npc_dota_hero_lina' },
      },
      {
        id: 'broken-global-task',
        scope: ChallengeScope.GLOBAL,
        metric: ChallengeMetric.BOT_KILLS,
        title: { cn: '共同任务' },
        description: { cn: '共同目标' },
      },
    ];
    config.globalTargetPolicies = { 'broken-global-task': null };
    config.globalRewardTiers = null;
    config.refreshCostsMemberPoint = {};
    config.streakMilestones = [null];

    expect(() => validator.validate(config as never)).not.toThrow();

    const issues = validator.validate(config as never);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'invalid_task_shape' }),
        expect.objectContaining({ code: 'invalid_localization', taskId: 'broken-task' }),
        expect.objectContaining({
          code: 'invalid_global_target_policy',
          taskId: 'broken-global-task',
        }),
        expect.objectContaining({ code: 'invalid_global_reward_tiers' }),
        expect.objectContaining({ code: 'invalid_refresh_costs_shape' }),
        expect.objectContaining({ code: 'invalid_streak_milestones' }),
      ]),
    );
  });

  it('accepts pure-damage evidence only when it names verified hero abilities and a game revision', () => {
    const config = makeConfig();
    config.tasks.push(
      makeTask({
        id: 'hero-pure-damage-1',
        scope: ChallengeScope.PERSONAL_HERO,
        metric: ChallengeMetric.PURE_DAMAGE,
        category: 'hero_pure_damage',
        heroName: 'npc_dota_hero_test_verified',
        minDataVersion: 2,
        pureDamageEvidence: {
          heroName: 'npc_dota_hero_test_verified',
          abilityNames: ['verified_pure_ability'],
          verifiedGameRevision: '0f6d2e0599fd43e86b870d8dc4dda88c1cabafb0',
          verifiedAt: '2026-08-04T00:00:00.000Z',
        },
      }),
    );

    expect(validator.validate(config)).toEqual([]);
  });

  it.each([
    ['physical_damage', ChallengeUnit.DAMAGE, 500000],
    ['magical_damage', ChallengeUnit.DAMAGE, 500000],
    ['pure_damage', ChallengeUnit.DAMAGE, 500000],
    ['bot_kills', ChallengeUnit.COUNT, 100],
    ['roshan_kills', ChallengeUnit.COUNT, 10],
    ['stun_duration_ms', ChallengeUnit.MILLISECOND, 600000],
    ['slow_duration_ms', ChallengeUnit.MILLISECOND, 600000],
    ['root_duration_ms', ChallengeUnit.MILLISECOND, 600000],
    ['silence_duration_ms', ChallengeUnit.MILLISECOND, 600000],
    ['taunt_duration_ms', ChallengeUnit.MILLISECOND, 600000],
    ['break_duration_ms', ChallengeUnit.MILLISECOND, 600000],
    ['debuff_duration_ms', ChallengeUnit.MILLISECOND, 600000],
  ])('accepts formal v2 metric %s with its required unit', (metric, unit, target) => {
    const config = makeConfig();
    const taskId = `formal-${metric}`;
    config.tasks.push(
      makeTask({
        id: taskId,
        metric,
        unit,
        target,
        category: metric,
        minDataVersion: 2,
      }),
    );

    expect(validator.validate(config).filter((issue) => issue.taskId === taskId)).toEqual([]);
  });

  it.each([
    ['physical_damage', ChallengeUnit.COUNT],
    ['bot_kills', ChallengeUnit.DAMAGE],
    ['stun_duration_ms', ChallengeUnit.DAMAGE],
  ])('rejects metric %s with the wrong unit', (metric, unit) => {
    const config = makeConfig();
    const taskId = `wrong-unit-${metric}`;
    config.tasks.push(
      makeTask({
        id: taskId,
        metric,
        unit,
        target: 100,
        category: metric,
        minDataVersion: 2,
      }),
    );

    expect(validator.validate(config)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'invalid_metric_unit', taskId })]),
    );
  });

  it.each([
    'physical_damage_target_ms',
    'stun_target_ms',
    'slow_target_ms',
    'root_target_ms',
    'silence_target_ms',
    'taunt_target_ms',
    'break_target_ms',
    'debuff_target_ms',
    'hard_control_target_ms',
  ])('rejects obsolete review metric name %s', (metric) => {
    const config = makeConfig();
    const taskId = `obsolete-${metric}`;
    config.tasks.push(makeTask({ id: taskId, metric, category: metric, minDataVersion: 2 }));

    expect(validator.validate(config)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'unsupported_metric', taskId })]),
    );
  });

  it('rejects a personal target above the conservative per-match metric limit', () => {
    const config = makeConfig();
    config.tasks.push(
      makeTask({
        id: 'impossible-personal-damage',
        target: 200000001,
        expectedMatches: 2,
      }),
    );

    expect(validator.validate(config)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'target_exceeds_metric_limit',
          taskId: 'impossible-personal-damage',
        }),
      ]),
    );
  });

  it('rejects a global task target outside its configured target policy bounds', () => {
    const config = makeConfig();
    const globalTask = config.tasks.find((task) => task.scope === ChallengeScope.GLOBAL)!;
    globalTask.target = 50001;

    expect(validator.validate(config)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'global_task_target_out_of_bounds',
          taskId: globalTask.id,
        }),
      ]),
    );
  });

  it('accepts legacy published configs without personal round or star settings', () => {
    const config = makeConfig();
    delete (config as any).personalRoundsPerDay;
    delete (config as any).personalStarRewards;
    delete (config as any).personalStarWeights;
    delete (config as any).personalDefaultStarMultipliers;

    expect(validator.validate(config)).toEqual([]);
  });

  it('accepts explicit personal round, reward, weight, multiplier and task star target settings', () => {
    const config = makeConfig() as any;
    config.personalRoundsPerDay = 3;
    config.personalStarRewards = { 1: 80, 2: 100, 3: 120 };
    config.personalStarWeights = { 1: 1, 2: 2, 3: 3 };
    config.personalDefaultStarMultipliers = { 1: 0.75, 2: 1, 3: 1.75 };
    config.tasks[0].starTargets = { 1: 250000, 2: 500000, 3: 875000 };

    expect(validator.validate(config)).toEqual([]);
  });

  it('rejects personal star rewards that decrease at higher difficulty', () => {
    const config = makeConfig() as any;
    config.personalStarRewards = { 1: 120, 2: 100, 3: 80 };

    expect(validator.validate(config)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'invalid_personal_star_reward_order' }),
      ]),
    );
  });

  it('rejects personal star multipliers that decrease at higher difficulty', () => {
    const config = makeConfig() as any;
    config.personalDefaultStarMultipliers = { 1: 2, 2: 1, 3: 0.5 };

    expect(validator.validate(config)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'invalid_personal_star_multiplier_order' }),
      ]),
    );
  });

  it('rejects task star targets that decrease at higher difficulty', () => {
    const config = makeConfig() as any;
    config.tasks[0].starTargets = { 1: 300, 2: 150, 3: 100 };

    expect(validator.validate(config)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid_task_star_target_order',
          taskId: config.tasks[0].id,
        }),
      ]),
    );
  });

  it('rejects invalid personal rounds, star maps and global star targets', () => {
    const config = makeConfig() as any;
    config.personalRoundsPerDay = 0;
    config.personalStarRewards = { 1: 80, 2: -1, 3: 120 };
    config.personalStarWeights = { 1: 0, 2: 0, 3: 0 };
    config.personalDefaultStarMultipliers = { 1: 0, 2: 1, 3: 1.75 };
    config.tasks.find((task: any) => task.scope === ChallengeScope.GLOBAL).starTargets = {
      1: 1,
      2: 2,
      3: 3,
    };

    expect(validator.validate(config)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'invalid_personal_rounds' }),
        expect.objectContaining({ code: 'invalid_personal_star_rewards' }),
        expect.objectContaining({ code: 'invalid_personal_star_weights' }),
        expect.objectContaining({ code: 'invalid_personal_star_multipliers' }),
        expect.objectContaining({ code: 'global_star_targets_not_allowed' }),
      ]),
    );
  });
});
