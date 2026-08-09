import { BadRequestException } from '@nestjs/common';

import {
  DailyChallengeConfigVersion,
  DailyChallengeConfigVersionStatus,
} from '../entities/daily-challenge-config.entity';
import { DailyChallengeConfigService } from '../services/daily-challenge-config.service';
import { DailyChallengeConfigSnapshot } from '../types/daily-challenge-config.types';

import { DailyChallengeConfigController } from './daily-challenge-config.controller';

const draft: DailyChallengeConfigSnapshot = {
  id: 'config-v2',
  version: 2,
  tasks: [],
  globalTargetPolicies: {},
  globalRewardTiers: {
    topPercent: 10,
    middlePercent: 30,
    topRewardSeasonPoint: 100,
    middleRewardSeasonPoint: 90,
    baseRewardSeasonPoint: 80,
  },
  refreshCostsMemberPoint: [10, 20, 30, 50, 50],
  streakMilestones: [],
};

const publishedVersion: DailyChallengeConfigVersion = {
  id: 'v2',
  version: 2,
  status: DailyChallengeConfigVersionStatus.PUBLISHED,
  snapshot: draft,
  createdBy: 'operator@example.com',
  createdAt: new Date('2026-08-05T00:00:00.000Z'),
  publishedAt: new Date('2026-08-05T00:00:00.000Z'),
};

describe('DailyChallengeConfigController', () => {
  const service = {
    getDraft: jest.fn(),
    saveDraft: jest.fn(),
    publishDraft: jest.fn(),
    getPublished: jest.fn(),
    listVersions: jest.fn(),
    getVersion: jest.fn(),
    rollback: jest.fn(),
  };
  const controller = new DailyChallengeConfigController(
    service as unknown as DailyChallengeConfigService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates draft and published configuration reads', async () => {
    const draftResult = { draft, issues: [] };
    service.getDraft.mockResolvedValue(draftResult);
    service.getPublished.mockResolvedValue(publishedVersion);
    service.listVersions.mockResolvedValue([publishedVersion]);
    service.getVersion.mockResolvedValue(publishedVersion);

    await expect(controller.getDraft()).resolves.toBe(draftResult);
    await expect(controller.getPublished()).resolves.toBe(publishedVersion);
    await expect(controller.listVersions()).resolves.toEqual([publishedVersion]);
    await expect(controller.getVersion('v2')).resolves.toBe(publishedVersion);

    expect(service.getDraft).toHaveBeenCalledTimes(1);
    expect(service.getPublished).toHaveBeenCalledTimes(1);
    expect(service.listVersions).toHaveBeenCalledTimes(1);
    expect(service.getVersion).toHaveBeenCalledWith('v2');
  });

  it('passes the audited actor when saving, publishing and rolling back configuration', async () => {
    const actor = 'operator@example.com';
    const draftResult = { draft, issues: [] };
    service.saveDraft.mockResolvedValue(draftResult);
    service.publishDraft.mockResolvedValue(publishedVersion);
    service.rollback.mockResolvedValue(publishedVersion);

    await expect(controller.saveDraft(draft, actor)).resolves.toBe(draftResult);
    await expect(controller.publishDraft(actor)).resolves.toBe(publishedVersion);
    await expect(controller.rollback('v2', actor)).resolves.toBe(publishedVersion);

    expect(service.saveDraft).toHaveBeenCalledWith(draft, actor);
    expect(service.publishDraft).toHaveBeenCalledWith(actor);
    expect(service.rollback).toHaveBeenCalledWith('v2', actor);
  });

  it.each([
    ['save draft', () => controller.saveDraft(draft, '   ')],
    ['publish draft', () => controller.publishDraft('')],
    ['rollback', () => controller.rollback('v2', undefined)],
  ])('rejects a missing audit actor for %s', (_label, action) => {
    expect(action).toThrow(BadRequestException);
  });
});
