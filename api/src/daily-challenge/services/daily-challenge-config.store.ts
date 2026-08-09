import { ConflictException, Injectable } from '@nestjs/common';
import { DocumentData, DocumentSnapshot, Timestamp, getFirestore } from 'firebase-admin/firestore';

import {
  DailyChallengeConfigVersion,
  DailyChallengeConfigVersionStatus,
} from '../entities/daily-challenge-config.entity';
import { DailyChallengeConfigSnapshot } from '../types/daily-challenge-config.types';

@Injectable()
export class DailyChallengeConfigStore {
  private readonly pointerCollection = 'daily_challenge_config';
  private readonly versionCollection = 'daily_challenge_config_versions';
  private readonly auditCollection = 'daily_challenge_config_audits';

  async getDraft(): Promise<DailyChallengeConfigSnapshot | null> {
    const snapshot = await getFirestore().collection(this.pointerCollection).doc('draft').get();
    return snapshot.exists
      ? ((snapshot.data()?.draft as DailyChallengeConfigSnapshot | undefined) ?? null)
      : null;
  }

  async saveDraft(config: DailyChallengeConfigSnapshot, actor: string): Promise<void> {
    const db = getFirestore();
    const now = new Date();
    const batch = db.batch();
    batch.set(db.collection(this.pointerCollection).doc('draft'), {
      id: 'draft',
      draft: config,
      updatedBy: actor,
      updatedAt: now,
    });
    batch.set(db.collection(this.auditCollection).doc(), {
      action: 'save_draft',
      actor,
      configVersion: config.version,
      createdAt: now,
    });
    await batch.commit();
  }

  async getPublishedVersionId(): Promise<string | null> {
    const snapshot = await getFirestore().collection(this.pointerCollection).doc('published').get();
    return snapshot.exists ? ((snapshot.data()?.versionId as string | undefined) ?? null) : null;
  }

  async getVersion(versionId: string): Promise<DailyChallengeConfigVersion | null> {
    const snapshot = await getFirestore().collection(this.versionCollection).doc(versionId).get();
    return snapshot.exists ? this.toVersion(snapshot) : null;
  }

  async listVersionsDescending(limit = 20): Promise<DailyChallengeConfigVersion[]> {
    const snapshots = await getFirestore()
      .collection(this.versionCollection)
      .orderBy('version', 'desc')
      .limit(limit)
      .get();
    return snapshots.docs.map((snapshot) => this.toVersion(snapshot));
  }

  async publish(
    config: DailyChallengeConfigSnapshot,
    actor: string,
  ): Promise<DailyChallengeConfigVersion> {
    const db = getFirestore();
    const versionId = `v${config.version}`;
    const versionRef = db.collection(this.versionCollection).doc(versionId);
    const pointerRef = db.collection(this.pointerCollection).doc('published');
    const auditRef = db.collection(this.auditCollection).doc();
    const now = new Date();

    await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(versionRef);
      if (existing.exists) {
        const existingSnapshot = existing.data()?.snapshot as
          | DailyChallengeConfigSnapshot
          | undefined;
        if (JSON.stringify(existingSnapshot) !== JSON.stringify(config)) {
          throw new ConflictException(`配置版本 ${versionId} 已存在且不可修改`);
        }
      } else {
        transaction.create(versionRef, {
          id: versionId,
          version: config.version,
          status: DailyChallengeConfigVersionStatus.PUBLISHED,
          snapshot: config,
          createdBy: actor,
          createdAt: now,
          publishedAt: now,
        });
      }

      transaction.set(pointerRef, {
        id: 'published',
        versionId,
        updatedBy: actor,
        updatedAt: now,
      });
      transaction.set(auditRef, {
        action: 'publish',
        actor,
        versionId,
        configVersion: config.version,
        createdAt: now,
      });
    });

    const result = await this.getVersion(versionId);
    if (!result) {
      throw new ConflictException(`配置版本 ${versionId} 发布后读取失败`);
    }
    return result;
  }

  async rollback(versionId: string, actor: string): Promise<void> {
    const db = getFirestore();
    const versionRef = db.collection(this.versionCollection).doc(versionId);
    const pointerRef = db.collection(this.pointerCollection).doc('published');
    const auditRef = db.collection(this.auditCollection).doc();
    const now = new Date();

    await db.runTransaction(async (transaction) => {
      const version = await transaction.get(versionRef);
      if (!version.exists) {
        throw new ConflictException(`配置版本 ${versionId} 不存在`);
      }
      transaction.set(pointerRef, {
        id: 'published',
        versionId,
        updatedBy: actor,
        updatedAt: now,
      });
      transaction.set(auditRef, {
        action: 'rollback',
        actor,
        versionId,
        createdAt: now,
      });
    });
  }

  private toVersion(snapshot: DocumentSnapshot<DocumentData>): DailyChallengeConfigVersion {
    const data = snapshot.data() ?? {};
    return {
      id: snapshot.id,
      version: data.version as number,
      status: data.status as DailyChallengeConfigVersionStatus,
      snapshot: data.snapshot as DailyChallengeConfigSnapshot,
      createdBy: data.createdBy as string,
      createdAt: this.toDate(data.createdAt),
      publishedAt: this.toDate(data.publishedAt),
    };
  }

  private toDate(value: unknown): Date {
    if (value instanceof Date) {
      return value;
    }
    if (value instanceof Timestamp) {
      return value.toDate();
    }
    return new Date(0);
  }
}
