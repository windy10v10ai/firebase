import { DAILY_TASKS, TaskDefinition } from '../config/tasks';
import { TaskMetric, TaskScope } from '../types/daily-task.types';

import { DailyTaskGenerationService } from './daily-task-generation.service';

describe('DailyTaskGenerationService', () => {
  let service: DailyTaskGenerationService;

  beforeEach(() => {
    service = new DailyTaskGenerationService();
  });

  it('returns identical candidates for identical inputs', () => {
    const input: [string, number, number, string[]] = ['20260816', 483215844, 1, []];

    expect(service.generateCandidates(...input)).toEqual(service.generateCandidates(...input));
  });

  it('changes candidates when the round changes', () => {
    const first = service.generateCandidates('20260816', 483215844, 1, []);
    const second = service.generateCandidates('20260816', 483215844, 2, []);

    expect(second).not.toEqual(first);
  });

  it('always includes both scopes and three distinct task ids', () => {
    for (let steamId = 1; steamId <= 100; steamId++) {
      const candidates = service.generateCandidates('20260816', steamId, 1, []);
      const scopes = candidates.map((candidate) => candidate.scope);

      expect(scopes).toContain(TaskScope.PERSONAL_GENERAL);
      expect(scopes).toContain(TaskScope.PERSONAL_HERO);
      expect(new Set(candidates.map((candidate) => candidate.taskId)).size).toBe(3);

      const heroNames = candidates
        .filter((candidate) => candidate.scope === TaskScope.PERSONAL_HERO)
        .map((candidate) => candidate.heroName);
      expect(new Set(heroNames).size).toBe(heroNames.length);
    }
  });

  it('produces both possible scope compositions and all star permutations', () => {
    const scopeCompositions = new Set<string>();
    const starPermutations = new Set<string>();

    for (let steamId = 1; steamId <= 1000; steamId++) {
      const candidates = service.generateCandidates('20260816', steamId, 1, []);
      scopeCompositions.add(candidates.map((candidate) => candidate.scope).join(','));
      starPermutations.add(candidates.map((candidate) => candidate.star).join(','));
    }

    expect(scopeCompositions.size).toBe(2);
    expect(starPermutations.size).toBe(6);
  });

  it('assigns each star exactly once per round', () => {
    const candidates = service.generateCandidates('20260816', 483215844, 1, []);

    expect(candidates.map((candidate) => candidate.star).sort()).toEqual([1, 2, 3]);
  });

  it('excludes every completed task id regardless of its previous star', () => {
    const completedTaskIds = DAILY_TASKS.slice(0, 8).map((task) => task.id);
    const candidates = service.generateCandidates('20260816', 483215844, 2, completedTaskIds);

    expect(candidates.every((candidate) => !completedTaskIds.includes(candidate.taskId))).toBe(
      true,
    );
  });

  it('uses additive targets below the threshold', () => {
    const task: TaskDefinition = {
      id: 'test_small',
      scope: TaskScope.PERSONAL_GENERAL,
      metric: TaskMetric.ROSHAN_KILLS,
      target: 1,
    };

    expect([1, 2, 3].map((star) => service.getTarget(task, star as 1 | 2 | 3))).toEqual([1, 2, 3]);
  });

  it('uses multiplicative targets at and above the threshold', () => {
    const task: TaskDefinition = {
      id: 'test_large',
      scope: TaskScope.PERSONAL_GENERAL,
      metric: TaskMetric.KILLS,
      target: 80,
    };

    expect([1, 2, 3].map((star) => service.getTarget(task, star as 1 | 2 | 3))).toEqual([
      80, 120, 160,
    ]);
  });
});
