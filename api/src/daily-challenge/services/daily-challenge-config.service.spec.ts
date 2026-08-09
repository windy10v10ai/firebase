import { BadRequestException, NotFoundException } from '@nestjs/common';

import { DailyChallengeConfigVersionStatus } from '../entities/daily-challenge-config.entity';
import { ChallengeMetric, ChallengeScope, ChallengeUnit } from '../types/daily-challenge.types';
import { DailyChallengeConfigValidator } from '../validators/daily-challenge-config.validator';

import { DailyChallengeConfigService } from './daily-challenge-config.service';
import { DailyChallengeConfigStore } from './daily-challenge-config.store';

const validConfig = () => ({
  id: 'config-v1',
  version: 1,
  tasks: [
    {
      id: 'general-damage',
      revision: 1,
      enabled: true,
      scope: ChallengeScope.PERSONAL_GENERAL,
      metric: ChallengeMetric.HERO_DAMAGE,
      unit: ChallengeUnit.DAMAGE,
      category: 'damage',
      title: { cn: '{target}', en: '{target}', ru: '{target}' },
      description: { cn: '{target}', en: '{target}', ru: '{target}' },
      target: 100,
      rewardSeasonPoint: 100,
      weight: 1,
      expectedMatches: 2,
      cooldownDays: 0,
      minDataVersion: 1,
      groupTags: [],
      mutexTags: [],
    },
    {
      id: 'general-healing',
      revision: 1,
      enabled: true,
      scope: ChallengeScope.PERSONAL_GENERAL,
      metric: ChallengeMetric.HEALING,
      unit: ChallengeUnit.DAMAGE,
      category: 'healing',
      title: { cn: '{target}', en: '{target}', ru: '{target}' },
      description: { cn: '{target}', en: '{target}', ru: '{target}' },
      target: 100,
      rewardSeasonPoint: 100,
      weight: 1,
      expectedMatches: 2,
      cooldownDays: 0,
      minDataVersion: 1,
      groupTags: [],
      mutexTags: [],
    },
    {
      id: 'hero-lina',
      revision: 1,
      enabled: true,
      scope: ChallengeScope.PERSONAL_HERO,
      metric: ChallengeMetric.HERO_DAMAGE,
      unit: ChallengeUnit.DAMAGE,
      category: 'hero_damage',
      heroName: 'npc_dota_hero_lina',
      title: { cn: '{target}', en: '{target}', ru: '{target}' },
      description: { cn: '{target}', en: '{target}', ru: '{target}' },
      target: 100,
      rewardSeasonPoint: 100,
      weight: 1,
      expectedMatches: 1,
      cooldownDays: 0,
      minDataVersion: 1,
      groupTags: [],
      mutexTags: [],
    },
    {
      id: 'global-towers',
      revision: 1,
      enabled: true,
      scope: ChallengeScope.GLOBAL,
      metric: ChallengeMetric.TOWER_KILLS,
      unit: ChallengeUnit.COUNT,
      category: 'tower_kills',
      title: { cn: '{target}', en: '{target}', ru: '{target}' },
      description: { cn: '{target}', en: '{target}', ru: '{target}' },
      target: 10000,
      rewardSeasonPoint: 100,
      weight: 1,
      expectedMatches: 1,
      cooldownDays: 0,
      minDataVersion: 1,
      groupTags: [],
      mutexTags: [],
    },
  ],
  globalTargetPolicies: {
    'global-towers': {
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
  streakMilestones: [{ days: 3, rewardSeasonPoint: 50 }],
});

describe('DailyChallengeConfigService', () => {
  const makeStore = () =>
    ({
      getDraft: jest.fn(),
      saveDraft: jest.fn(),
      getPublishedVersionId: jest.fn(),
      getVersion: jest.fn(),
      listVersionsDescending: jest.fn(),
      publish: jest.fn(),
      rollback: jest.fn(),
    }) as unknown as jest.Mocked<DailyChallengeConfigStore>;

  it('saves an invalid draft for editing but returns blocking validation issues', async () => {
    const store = makeStore();
    const service = new DailyChallengeConfigService(store, new DailyChallengeConfigValidator());
    const draft = validConfig();
    draft.tasks = draft.tasks.slice(0, 1);

    const result = await service.saveDraft(draft, 'local-admin');

    expect(result.issues.length).toBeGreaterThan(0);
    expect(store.saveDraft).toHaveBeenCalledWith(draft, 'local-admin');
  });

  it('blocks publishing a draft with validation errors', async () => {
    const store = makeStore();
    const draft = validConfig();
    draft.tasks = draft.tasks.slice(0, 1);
    store.getDraft.mockResolvedValue(draft);
    const service = new DailyChallengeConfigService(store, new DailyChallengeConfigValidator());

    await expect(service.publishDraft('local-admin')).rejects.toBeInstanceOf(BadRequestException);
    expect(store.publish).not.toHaveBeenCalled();
  });

  it('publishes a valid immutable version', async () => {
    const store = makeStore();
    const draft = validConfig();
    store.getDraft.mockResolvedValue(draft);
    store.publish.mockResolvedValue({
      id: 'v1',
      version: 1,
      status: DailyChallengeConfigVersionStatus.PUBLISHED,
      snapshot: draft,
      createdBy: 'local-admin',
      createdAt: new Date('2026-08-04T00:00:00.000Z'),
      publishedAt: new Date('2026-08-04T00:00:00.000Z'),
    });
    const service = new DailyChallengeConfigService(store, new DailyChallengeConfigValidator());

    await expect(service.publishDraft('local-admin')).resolves.toEqual(
      expect.objectContaining({ id: 'v1', version: 1 }),
    );
    expect(store.publish).toHaveBeenCalledWith(draft, 'local-admin');
  });

  it('lists published versions in descending order through the store', async () => {
    const store = makeStore();
    const versions = [{ id: 'v2' }, { id: 'v1' }];
    store.listVersionsDescending.mockResolvedValue(versions as never);
    const service = new DailyChallengeConfigService(store, new DailyChallengeConfigValidator());

    await expect(service.listVersions()).resolves.toBe(versions);
    expect(store.listVersionsDescending).toHaveBeenCalledTimes(1);
  });

  it('falls back to the latest valid immutable version if the published pointer is bad', async () => {
    const store = makeStore();
    const invalid = validConfig();
    invalid.tasks = invalid.tasks.slice(0, 1);
    const valid = validConfig();
    valid.version = 2;
    store.getPublishedVersionId.mockResolvedValue('missing-version');
    store.getVersion.mockResolvedValue(null);
    store.listVersionsDescending.mockResolvedValue([
      { id: 'v3', version: 3, snapshot: invalid },
      { id: 'v2', version: 2, snapshot: valid },
    ] as never);
    const service = new DailyChallengeConfigService(store, new DailyChallengeConfigValidator());

    await expect(service.getPublished()).resolves.toEqual(expect.objectContaining({ id: 'v2' }));
  });

  it('rejects rollback to a missing or invalid immutable version', async () => {
    const store = makeStore();
    store.getVersion.mockResolvedValue(null);
    const service = new DailyChallengeConfigService(store, new DailyChallengeConfigValidator());

    await expect(service.rollback('v404', 'local-admin')).rejects.toBeInstanceOf(NotFoundException);
  });
});
