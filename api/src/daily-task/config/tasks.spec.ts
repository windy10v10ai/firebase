import { TaskMetric, TaskScope } from '../types/daily-task.types';

import {
  DAILY_TASKS,
  ROUNDS_PER_DAY,
  SMALL_TARGET_THRESHOLD,
  STAR_REWARDS,
  STAR_TARGET_MULTIPLIERS,
  TaskDefinition,
} from './tasks';

const STARS = [1, 2, 3] as const;
const TASK_METRICS = Object.values(TaskMetric);
const GENERAL_TASKS = DAILY_TASKS.filter((task) => task.scope === TaskScope.PERSONAL_GENERAL);
const HERO_TASKS = DAILY_TASKS.filter((task) => task.scope === TaskScope.PERSONAL_HERO);

const groupHeroTasks = (): Map<string, TaskDefinition[]> => {
  const tasksByHero = new Map<string, TaskDefinition[]>();

  for (const task of HERO_TASKS) {
    const heroName = task.heroName ?? '';
    tasksByHero.set(heroName, [...(tasksByHero.get(heroName) ?? []), task]);
  }

  return tasksByHero;
};

describe('daily task configuration', () => {
  it('keeps the reviewed personal task pool', () => {
    expect(DAILY_TASKS).toHaveLength(255);
    expect(GENERAL_TASKS).toHaveLength(10);
    expect(HERO_TASKS).toHaveLength(245);
    expect(new Set(DAILY_TASKS.map((task) => task.id)).size).toBe(255);
  });

  it('uses every metric exactly once in the general pool', () => {
    expect(GENERAL_TASKS.map((task) => task.metric).sort()).toEqual([...TASK_METRICS].sort());

    for (const task of GENERAL_TASKS) {
      expect(task.id).toBe(`general_${task.metric}`);
    }
  });

  it('uses positive integer targets and enum metrics', () => {
    for (const task of DAILY_TASKS) {
      expect(Number.isInteger(task.target)).toBe(true);
      expect(task.target).toBeGreaterThan(0);
      expect(TASK_METRICS).toContain(task.metric);
    }
  });

  it('gives hero names to hero tasks only', () => {
    for (const task of DAILY_TASKS) {
      if (task.scope === TaskScope.PERSONAL_HERO) {
        expect(task.heroName).toMatch(/^npc_dota_hero_[a-z0-9_]+$/);
      } else {
        expect(task.heroName).toBeUndefined();
      }
    }
  });

  it('keeps general targets higher than hero targets for the same metric', () => {
    for (const generalTask of GENERAL_TASKS) {
      const matchingHeroTasks = HERO_TASKS.filter((task) => task.metric === generalTask.metric);
      if (matchingHeroTasks.length === 0) {
        continue;
      }

      const highestHeroTarget = Math.max(...matchingHeroTasks.map((task) => task.target));
      expect(generalTask.target).toBeGreaterThan(highestHeroTarget);
    }
  });
});

describe('daily task hero pool', () => {
  it('covers all heroes with one to three tasks each', () => {
    const tasksByHero = groupHeroTasks();
    const taskCountDistribution = { 1: 0, 2: 0, 3: 0 };

    expect(tasksByHero.size).toBe(127);

    for (const tasks of tasksByHero.values()) {
      expect(tasks.length).toBeGreaterThanOrEqual(1);
      expect(tasks.length).toBeLessThanOrEqual(3);
      taskCountDistribution[tasks.length as keyof typeof taskCountDistribution] += 1;
    }

    expect(taskCountDistribution).toEqual({ 1: 14, 2: 108, 3: 5 });
  });

  it('numbers task ids after their hero without gaps', () => {
    for (const [heroName, tasks] of groupHeroTasks()) {
      const shortName = heroName.replace('npc_dota_hero_', '');
      const expectedIds = tasks.map((_, index) => `hero_${shortName}_${index + 1}`);
      expect(tasks.map((task) => task.id)).toEqual(expectedIds);
    }
  });

  it('never repeats a metric within one hero', () => {
    for (const tasks of groupHeroTasks().values()) {
      const metrics = tasks.map((task) => task.metric);
      expect(new Set(metrics).size).toBe(metrics.length);
    }
  });

  it('keeps the reviewed metric distribution', () => {
    const metricCounts = Object.fromEntries(
      TASK_METRICS.map((metric) => [
        metric,
        HERO_TASKS.filter((task) => task.metric === metric).length,
      ]),
    );

    expect(metricCounts).toEqual({
      [TaskMetric.KILLS]: 9,
      [TaskMetric.ASSISTS]: 14,
      [TaskMetric.LAST_HITS]: 0,
      [TaskMetric.TOWER_KILLS]: 7,
      [TaskMetric.HERO_DAMAGE]: 102,
      [TaskMetric.HEALING]: 34,
      [TaskMetric.TOTAL_GOLD_EARNED]: 0,
      [TaskMetric.DAMAGE_TAKEN]: 20,
      [TaskMetric.STUN_DURATION]: 59,
      [TaskMetric.ROSHAN_KILLS]: 0,
    });
  });
});

describe('daily task numeric parameters', () => {
  it('runs three rounds and rewards higher stars more', () => {
    expect(ROUNDS_PER_DAY).toBe(3);
    expect(STAR_REWARDS).toEqual({ 1: 60, 2: 80, 3: 100 });

    for (const star of STARS) {
      expect(Number.isInteger(STAR_REWARDS[star])).toBe(true);
      expect(STAR_REWARDS[star]).toBeGreaterThan(0);
    }
    expect(STAR_REWARDS[2]).toBeGreaterThan(STAR_REWARDS[1]);
    expect(STAR_REWARDS[3]).toBeGreaterThan(STAR_REWARDS[2]);
  });

  it('keeps the reviewed target scaling parameters', () => {
    expect(STAR_TARGET_MULTIPLIERS).toEqual({ 1: 1, 2: 1.5, 3: 2 });
    expect(SMALL_TARGET_THRESHOLD).toBe(10);
  });

  it('keeps multiplied star targets as integers', () => {
    const multipliedTasks = DAILY_TASKS.filter((task) => task.target >= SMALL_TARGET_THRESHOLD);

    for (const task of multipliedTasks) {
      expect(task.target % 2).toBe(0);
      for (const star of STARS) {
        expect(Number.isInteger(task.target * STAR_TARGET_MULTIPLIERS[star])).toBe(true);
      }
    }
  });

  it('gives small targets a distinct additive target at every star', () => {
    const smallTasks = DAILY_TASKS.filter((task) => task.target < SMALL_TARGET_THRESHOLD);

    for (const task of smallTasks) {
      const starTargets = STARS.map((star) => task.target + (star - 1));
      expect(starTargets[1]).toBeGreaterThan(starTargets[0]);
      expect(starTargets[2]).toBeGreaterThan(starTargets[1]);
    }

    const roshanTask = GENERAL_TASKS.find((task) => task.metric === TaskMetric.ROSHAN_KILLS);
    expect(roshanTask).toBeDefined();
    expect(STARS.map((star) => (roshanTask?.target ?? 0) + (star - 1))).toEqual([1, 2, 3]);
  });
});
