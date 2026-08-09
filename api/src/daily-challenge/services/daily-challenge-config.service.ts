import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { DailyChallengeConfigVersion } from '../entities/daily-challenge-config.entity';
import {
  DailyChallengeConfigSnapshot,
  DailyChallengeConfigValidationIssue,
} from '../types/daily-challenge-config.types';
import { DailyChallengeConfigValidator } from '../validators/daily-challenge-config.validator';

import { DailyChallengeConfigStore } from './daily-challenge-config.store';

export interface DailyChallengeDraftResult {
  draft: DailyChallengeConfigSnapshot;
  issues: DailyChallengeConfigValidationIssue[];
}

@Injectable()
export class DailyChallengeConfigService {
  constructor(
    private readonly store: DailyChallengeConfigStore,
    private readonly validator: DailyChallengeConfigValidator,
  ) {}

  async getDraft(): Promise<DailyChallengeDraftResult | null> {
    const draft = await this.store.getDraft();
    return draft ? { draft, issues: this.validator.validate(draft) } : null;
  }

  async saveDraft(
    config: DailyChallengeConfigSnapshot,
    actor: string,
  ): Promise<DailyChallengeDraftResult> {
    const issues = this.validator.validate(config);
    await this.store.saveDraft(config, actor);
    return { draft: config, issues };
  }

  async publishDraft(actor: string): Promise<DailyChallengeConfigVersion> {
    const draft = await this.store.getDraft();
    if (!draft) {
      throw new NotFoundException('每日挑战草稿不存在');
    }
    this.assertPublishable(draft);
    return this.store.publish(draft, actor);
  }

  async getPublished(): Promise<DailyChallengeConfigVersion> {
    const pointer = await this.store.getPublishedVersionId();
    if (pointer) {
      const pointedVersion = await this.store.getVersion(pointer);
      if (pointedVersion && this.validator.validate(pointedVersion.snapshot).length === 0) {
        return pointedVersion;
      }
    }

    const versions = await this.store.listVersionsDescending();
    const fallback = versions.find(
      (version) => this.validator.validate(version.snapshot).length === 0,
    );
    if (!fallback) {
      throw new NotFoundException('没有可用的每日挑战已发布配置');
    }
    return fallback;
  }

  async listVersions(): Promise<DailyChallengeConfigVersion[]> {
    return this.store.listVersionsDescending();
  }

  async getVersion(versionId: string): Promise<DailyChallengeConfigVersion | null> {
    return this.store.getVersion(versionId);
  }
  async rollback(versionId: string, actor: string): Promise<DailyChallengeConfigVersion> {
    const version = await this.store.getVersion(versionId);
    if (!version) {
      throw new NotFoundException(`每日挑战配置版本 ${versionId} 不存在`);
    }
    this.assertPublishable(version.snapshot);
    await this.store.rollback(versionId, actor);
    return version;
  }

  private assertPublishable(config: DailyChallengeConfigSnapshot): void {
    const issues = this.validator.validate(config);
    if (issues.some((issue) => issue.severity === 'error')) {
      throw new BadRequestException({
        message: '每日挑战配置未通过发布校验',
        issues,
      });
    }
  }
}
