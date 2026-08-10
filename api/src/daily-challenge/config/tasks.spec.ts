import { DailyChallengeGenerationService } from '../services/daily-challenge-generation.service';
import { DailyChallengeTaskDefinition } from '../types/daily-challenge-config.types';
import {
  ChallengeScope,
  DAILY_CHALLENGE_MATCH_DATA_VERSION,
  DAILY_CHALLENGE_METRIC_MIN_DATA_VERSION,
  DailyChallengePersonalStar,
} from '../types/daily-challenge.types';

import { DAILY_CHALLENGE_CONFIG, DAILY_CHALLENGE_TASKS } from './tasks';

// 配置是代码常量，TypeScript 只保证形状，取值层的错误全靠这个文件挡。
const TASKS: DailyChallengeTaskDefinition[] = DAILY_CHALLENGE_TASKS;
const STARS: DailyChallengePersonalStar[] = [1, 2, 3];

const tasksIn = (scope: ChallengeScope): DailyChallengeTaskDefinition[] =>
  TASKS.filter((task) => task.scope === scope);

const groupHeroTasks = (): Map<string, DailyChallengeTaskDefinition[]> => {
  const byHero = new Map<string, DailyChallengeTaskDefinition[]>();
  for (const task of tasksIn(ChallengeScope.PERSONAL_HERO)) {
    const heroName = task.heroName ?? '';
    byHero.set(heroName, [...(byHero.get(heroName) ?? []), task]);
  }
  return byHero;
};

describe('daily challenge code configuration', () => {
  it('keeps the reviewed 404-task pool in typed source code', () => {
    expect(DAILY_CHALLENGE_TASKS).toHaveLength(404);
    expect(tasksIn(ChallengeScope.PERSONAL_GENERAL)).toHaveLength(19);
    expect(tasksIn(ChallengeScope.PERSONAL_HERO)).toHaveLength(381);
    expect(tasksIn(ChallengeScope.GLOBAL)).toHaveLength(4);
    expect(new Set(TASKS.map((task) => task.id)).size).toBe(404);
  });

  it('contains only runtime task data instead of localized or derivable fields', () => {
    for (const task of DAILY_CHALLENGE_TASKS) {
      expect(task).not.toHaveProperty('title');
      expect(task).not.toHaveProperty('description');
      expect(task).not.toHaveProperty('groupTags');
      expect(task).not.toHaveProperty('mutexTags');
      expect(task).not.toHaveProperty('rewardSeasonPoint');
      expect(task).not.toHaveProperty('unit');
      expect(task).not.toHaveProperty('weight');
    }
  });

  it('keeps only the small operational values beside the code task pool', () => {
    expect(DAILY_CHALLENGE_CONFIG.personalRoundsPerDay).toBe(3);
    expect(DAILY_CHALLENGE_CONFIG.personalStarRewards).toEqual({
      1: 80,
      2: 100,
      3: 120,
    });
    expect(DAILY_CHALLENGE_CONFIG).not.toHaveProperty('globalTargetPolicies');
    expect(DAILY_CHALLENGE_CONFIG.refreshCostsMemberPoint).toHaveLength(5);
    expect(DAILY_CHALLENGE_CONFIG.streakMilestones).toHaveLength(4);
  });
});

describe('daily challenge task values', () => {
  it('uses a positive integer target for every task', () => {
    for (const task of TASKS) {
      // 星级倍率会乘上基准目标，非整数基准会让一星/三星目标出现小数。
      expect(Number.isInteger(task.target)).toBe(true);
      expect(task.target).toBeGreaterThan(0);
    }
  });

  it('only uses metrics the game already reports', () => {
    for (const task of TASKS) {
      // 指标要求的采集版本高于游戏端实际发送的版本时，任务会静默永远不推进。
      expect(DAILY_CHALLENGE_METRIC_MIN_DATA_VERSION[task.metric]).toBeLessThanOrEqual(
        DAILY_CHALLENGE_MATCH_DATA_VERSION,
      );
    }
  });

  it('keeps optional star targets positive and increasing', () => {
    for (const task of TASKS) {
      if (!task.starTargets) {
        continue;
      }
      for (const star of STARS) {
        expect(Number.isInteger(task.starTargets[star])).toBe(true);
        expect(task.starTargets[star]).toBeGreaterThan(0);
      }
      expect(task.starTargets[2]).toBeGreaterThan(task.starTargets[1]);
      expect(task.starTargets[3]).toBeGreaterThan(task.starTargets[2]);
    }
  });
});

describe('daily challenge hero task pool', () => {
  it('gives every hero exactly three tasks', () => {
    const byHero = groupHeroTasks();
    expect(byHero.size).toBe(127);
    for (const [heroName, tasks] of byHero) {
      expect(tasks).toHaveLength(3);
      expect(heroName).toMatch(/^npc_dota_hero_[a-z0-9_]+$/);
    }
  });

  it('numbers hero task ids after their hero', () => {
    for (const [heroName, tasks] of groupHeroTasks()) {
      // 任务池是手写字面量，复制粘贴后忘改 id 序号或 heroName 是最容易犯的错。
      const shortName = heroName.replace('npc_dota_hero_', '');
      const expectedIds = tasks.map((_, index) => `hero_${shortName}_${index + 1}`);
      expect(tasks.map((task) => task.id).sort()).toEqual(expectedIds.sort());
    }
  });

  it('never repeats a metric within one hero', () => {
    for (const [, tasks] of groupHeroTasks()) {
      // 同一英雄配重复指标会让同一轮刷出两个内容一样的候选。
      const metrics = tasks.map((task) => task.metric);
      expect(new Set(metrics).size).toBe(metrics.length);
    }
  });

  it('gives a hero name to hero tasks only', () => {
    for (const task of TASKS) {
      if (task.scope === ChallengeScope.PERSONAL_HERO) {
        expect(task.heroName).toMatch(/^npc_dota_hero_/);
      } else {
        // 通用或共同任务带上 heroName 会让进度归属要求英雄匹配，任务永远无法完成。
        expect(task.heroName).toBeUndefined();
      }
    }
  });
});

describe('daily challenge pool covers a full round', () => {
  const generation = new DailyChallengeGenerationService();
  const dayIds = Array.from({ length: 60 }, (_, index) =>
    new Date(Date.UTC(2026, 7, 1 + index)).toISOString().slice(0, 10),
  );

  it('always draws two distinct general candidates and one hero candidate', () => {
    // 通用任务分类不足两种时，第二个通用候选的候选池会为空并抛出"任务池容量不足"，
    // 所以这条用例同时守住了分类覆盖、池容量和抽取逻辑。
    for (let steamId = 1; steamId <= 200; steamId += 1) {
      const candidates = generation.generatePlayerCandidates({
        dayId: dayIds[steamId % dayIds.length],
        steamId,
        refreshIndex: 0,
        configVersion: DAILY_CHALLENGE_CONFIG.version,
        tasks: DAILY_CHALLENGE_CONFIG.tasks,
        seenTaskIds: [],
      });

      expect(candidates).toHaveLength(3);
      expect(
        candidates.filter((task) => task.scope === ChallengeScope.PERSONAL_GENERAL),
      ).toHaveLength(2);
      expect(candidates.filter((task) => task.scope === ChallengeScope.PERSONAL_HERO)).toHaveLength(
        1,
      );
      expect(new Set(candidates.map((task) => task.id)).size).toBe(3);
      for (const candidate of candidates) {
        expect(STARS).toContain(candidate.star);
      }
    }
  });

  it('always draws a global task', () => {
    for (const dayId of dayIds) {
      const globalTask = generation.generateGlobalTask(
        dayId,
        DAILY_CHALLENGE_CONFIG.version,
        DAILY_CHALLENGE_CONFIG.tasks,
      );
      expect(globalTask.scope).toBe(ChallengeScope.GLOBAL);
    }
  });
});

describe('daily challenge reward parameters', () => {
  it('runs a positive whole number of personal rounds per day', () => {
    expect(Number.isInteger(DAILY_CHALLENGE_CONFIG.personalRoundsPerDay)).toBe(true);
    expect(DAILY_CHALLENGE_CONFIG.personalRoundsPerDay).toBeGreaterThan(0);
  });

  it('pays more season points for higher stars', () => {
    const rewards = DAILY_CHALLENGE_CONFIG.personalStarRewards;
    for (const star of STARS) {
      expect(Number.isInteger(rewards[star])).toBe(true);
      expect(rewards[star]).toBeGreaterThan(0);
    }
    expect(rewards[2]).toBeGreaterThan(rewards[1]);
    expect(rewards[3]).toBeGreaterThan(rewards[2]);
  });

  it('keeps star weights drawable and multipliers increasing', () => {
    const weights = DAILY_CHALLENGE_CONFIG.personalStarWeights;
    const multipliers = DAILY_CHALLENGE_CONFIG.personalDefaultStarMultipliers;
    // 权重全为 0 不会报错，但会让每个候选都固定抽到三星。
    expect(STARS.reduce((total, star) => total + weights[star], 0)).toBeGreaterThan(0);
    for (const star of STARS) {
      expect(weights[star]).toBeGreaterThanOrEqual(0);
      expect(multipliers[star]).toBeGreaterThan(0);
    }
    expect(multipliers[2]).toBeGreaterThan(multipliers[1]);
    expect(multipliers[3]).toBeGreaterThan(multipliers[2]);
  });

  it('prices every paid refresh', () => {
    // 数组长度就是每日付费刷新上限，写错会直接改变商业化行为。
    for (const cost of DAILY_CHALLENGE_CONFIG.refreshCostsMemberPoint) {
      expect(Number.isInteger(cost)).toBe(true);
      expect(cost).toBeGreaterThan(0);
    }
  });

  it('keeps streak milestones increasing in both days and reward', () => {
    // 结算服务会自行排序，所以乱序不会报错，但天数越高奖励越低会直接发错积分。
    const milestones = DAILY_CHALLENGE_CONFIG.streakMilestones;
    expect(milestones.length).toBeGreaterThan(0);
    milestones.slice(1).forEach((milestone, index) => {
      expect(milestone.days).toBeGreaterThan(milestones[index].days);
      expect(milestone.rewardSeasonPoint).toBeGreaterThan(milestones[index].rewardSeasonPoint);
    });
  });

  it('pays global contribution tiers in descending order', () => {
    const tiers = DAILY_CHALLENGE_CONFIG.globalRewardTiers;
    expect(tiers.topRewardSeasonPoint).toBeGreaterThanOrEqual(tiers.middleRewardSeasonPoint);
    expect(tiers.middleRewardSeasonPoint).toBeGreaterThanOrEqual(tiers.baseRewardSeasonPoint);
    expect(tiers.topPercent).toBeGreaterThan(0);
    expect(tiers.middlePercent).toBeGreaterThan(0);
    expect(tiers.topPercent + tiers.middlePercent).toBeLessThan(100);
  });
});
