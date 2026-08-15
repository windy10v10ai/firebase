import { Injectable } from '@nestjs/common';
import {
  DocumentData,
  DocumentSnapshot,
  Timestamp,
  Transaction,
  getFirestore,
} from 'firebase-admin/firestore';

import { DailyChallengeRewardLedger } from '../entities/daily-challenge-reward-ledger.entity';

import { sanitizeDailyChallengeFirestoreDocument } from './daily-challenge-player.store';

export interface DailyChallengeRewardGrantResult {
  reward: DailyChallengeRewardLedger;
  created: boolean;
}

@Injectable()
export class DailyChallengeRewardStore {
  private readonly rewardCollection = 'daily_challenge_reward_ledger';
  private readonly playerCollection = 'Players';
  private readonly firestoreWriteBatchLimit = 500;

  async grant(reward: DailyChallengeRewardLedger): Promise<DailyChallengeRewardGrantResult> {
    return getFirestore().runTransaction((transaction) =>
      this.grantInTransaction(transaction, reward),
    );
  }

  async grantInTransaction(
    transaction: Transaction,
    reward: DailyChallengeRewardLedger,
  ): Promise<DailyChallengeRewardGrantResult> {
    const db = getFirestore();
    const rewardRef = db.collection(this.rewardCollection).doc(reward.id);
    const playerRef = db.collection(this.playerCollection).doc(reward.steamId.toString());
    const rewardSnapshot = await transaction.get(rewardRef);
    if (rewardSnapshot.exists) {
      return { reward: this.toReward(rewardSnapshot), created: false };
    }

    const playerSnapshot = await transaction.get(playerRef);
    if (!playerSnapshot.exists) {
      throw new Error(`Player ${reward.steamId} does not exist`);
    }
    const seasonPointTotal = Number(playerSnapshot.data()?.seasonPointTotal ?? 0);
    transaction.update(playerRef, {
      seasonPointTotal: seasonPointTotal + reward.seasonPoint,
    });
    transaction.create(rewardRef, sanitizeDailyChallengeFirestoreDocument(reward));
    return { reward, created: true };
  }

  async claimPending(steamIds: number[], now: Date): Promise<DailyChallengeRewardLedger[]> {
    const db = getFirestore();
    const claimed: DailyChallengeRewardLedger[] = [];
    for (const steamId of [...new Set(steamIds)]) {
      while (true) {
        const rewards = await db.runTransaction(async (transaction) => {
          const query = db.collection(this.rewardCollection).where('steamId', '==', steamId);
          const snapshot = await transaction.get(query);
          const pending = snapshot.docs
            .map((document) => ({ document, reward: this.toReward(document) }))
            .filter(({ reward }) => reward.notificationStatus === 'pending')
            .slice(0, this.firestoreWriteBatchLimit);
          for (const { document } of pending) {
            transaction.update(document.ref, {
              notificationStatus: 'notified',
              notifiedAt: now,
            });
          }
          return pending.map(({ reward }) => ({
            ...reward,
            notificationStatus: 'notified' as const,
            notifiedAt: now,
          }));
        });
        claimed.push(...rewards);
        if (rewards.length < this.firestoreWriteBatchLimit) {
          break;
        }
      }
    }
    return claimed;
  }

  async listRecent(steamId: number, limit: number = 20): Promise<DailyChallengeRewardLedger[]> {
    const boundedLimit = Math.max(1, Math.min(Math.trunc(limit), 50));
    const snapshot = await getFirestore()
      .collection(this.rewardCollection)
      .where('steamId', '==', steamId)
      .orderBy('createdAt', 'desc')
      .limit(boundedLimit)
      .get();
    return snapshot.docs.map((document) => this.toReward(document));
  }

  async countUnread(steamId: number): Promise<number> {
    const snapshot = await getFirestore()
      .collection(this.rewardCollection)
      .where('steamId', '==', steamId)
      .get();
    return snapshot.docs
      .map((document) => this.toReward(document))
      .filter(({ notificationStatus, viewedAt }) => notificationStatus !== 'viewed' && !viewedAt)
      .length;
  }

  async markViewed(steamId: number, now: Date): Promise<number> {
    const db = getFirestore();
    const snapshot = await db
      .collection(this.rewardCollection)
      .where('steamId', '==', steamId)
      .get();
    const unread = snapshot.docs
      .map((document) => ({ document, reward: this.toReward(document) }))
      .filter(({ reward }) => reward.notificationStatus !== 'viewed' && !reward.viewedAt);
    if (unread.length === 0) {
      return 0;
    }
    for (let offset = 0; offset < unread.length; offset += this.firestoreWriteBatchLimit) {
      const batch = db.batch();
      for (const { document } of unread.slice(offset, offset + this.firestoreWriteBatchLimit)) {
        batch.update(document.ref, {
          notificationStatus: 'viewed',
          viewedAt: now,
        });
      }
      await batch.commit();
    }
    return unread.length;
  }

  private toReward(snapshot: DocumentSnapshot<DocumentData>): DailyChallengeRewardLedger {
    const data = snapshot.data() as DailyChallengeRewardLedger;
    return {
      ...data,
      id: snapshot.id,
      createdAt: this.toDate(data.createdAt),
      notifiedAt: data.notifiedAt ? this.toDate(data.notifiedAt) : undefined,
      viewedAt: data.viewedAt ? this.toDate(data.viewedAt) : undefined,
    };
  }

  private toDate(value: unknown): Date {
    if (value instanceof Date) {
      return value;
    }
    if (value instanceof Timestamp) {
      return value.toDate();
    }
    return new Date(value as string | number);
  }
}
