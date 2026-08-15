import { Injectable } from '@nestjs/common';
import { DocumentData, DocumentSnapshot, Timestamp, getFirestore } from 'firebase-admin/firestore';

import { DailyChallengeDay } from '../entities/daily-challenge-day.entity';
import { DailyChallengeGlobalContribution } from '../entities/daily-challenge-global-contribution.entity';
import { DailyChallengeGlobalRanking } from '../entities/daily-challenge-global-ranking.entity';
import { ChallengeDayStatus } from '../types/daily-challenge.types';

import { sanitizeDailyChallengeFirestoreDocument } from './daily-challenge-player.store';

export interface DailyChallengeFreezeSummary {
  globalProgress: number;
  globalCompleted: boolean;
  eligibleContributionCount: number;
  frozenAt: Date;
}

@Injectable()
export class DailyChallengeGlobalFreezeStore {
  private readonly dayCollection = 'daily_challenge_days';
  private readonly contributionCollection = 'daily_challenge_global_contributions';
  private readonly rankingCollection = 'daily_challenge_global_rankings';

  async beginFreeze(dayId: string, now: Date): Promise<DailyChallengeDay> {
    const db = getFirestore();
    const dayRef = db.collection(this.dayCollection).doc(dayId);
    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(dayRef);
      if (!snapshot.exists) {
        throw new Error(`Daily challenge day ${dayId} does not exist`);
      }

      const day = this.toDay(snapshot);
      if (
        day.status === ChallengeDayStatus.FROZEN ||
        day.status === ChallengeDayStatus.REWARDING ||
        day.status === ChallengeDayStatus.SETTLED
      ) {
        return day;
      }
      if (now.getTime() < day.closesAt.getTime()) {
        throw new Error(`Daily challenge day ${dayId} is not ready to freeze`);
      }
      if (day.freezeStartedAt) {
        return day;
      }

      const next: DailyChallengeDay = {
        ...day,
        status: ChallengeDayStatus.CLOSING,
        freezeStartedAt: now,
        updatedAt: now,
      };
      transaction.update(dayRef, {
        status: next.status,
        freezeStartedAt: now,
        updatedAt: now,
      });
      return next;
    });
  }

  async *streamContributionPages(
    dayId: string,
    requestedPageSize = 500,
  ): AsyncGenerator<DailyChallengeGlobalContribution[]> {
    const db = getFirestore();
    const pageSize = Math.min(500, Math.max(1, Math.trunc(requestedPageSize)));
    let cursor: DocumentSnapshot<DocumentData> | undefined;

    while (true) {
      let query = db
        .collection(this.contributionCollection)
        .where('dayId', '==', dayId)
        .orderBy('value', 'desc')
        .orderBy('steamId', 'asc')
        .limit(pageSize);
      if (cursor) {
        query = query.startAfter(cursor);
      }

      const snapshot = await query.get();
      if (snapshot.empty) {
        break;
      }
      yield snapshot.docs.map((document) => this.toContribution(document));
      cursor = snapshot.docs[snapshot.docs.length - 1];
      if (snapshot.docs.length < pageSize) {
        break;
      }
    }
  }

  async writeRankings(rankings: DailyChallengeGlobalRanking[]): Promise<void> {
    if (rankings.length === 0) {
      return;
    }

    const db = getFirestore();
    for (let offset = 0; offset < rankings.length; offset += 500) {
      const batch = db.batch();
      for (const ranking of rankings.slice(offset, offset + 500)) {
        const ref = db.collection(this.rankingCollection).doc(ranking.id);
        batch.set(ref, sanitizeDailyChallengeFirestoreDocument(ranking));
      }
      await batch.commit();
    }
  }

  async completeFreeze(
    dayId: string,
    summary: DailyChallengeFreezeSummary,
  ): Promise<DailyChallengeDay> {
    const db = getFirestore();
    const dayRef = db.collection(this.dayCollection).doc(dayId);
    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(dayRef);
      if (!snapshot.exists) {
        throw new Error(`Daily challenge day ${dayId} does not exist`);
      }

      const day = this.toDay(snapshot);
      if (
        day.status === ChallengeDayStatus.FROZEN ||
        day.status === ChallengeDayStatus.REWARDING ||
        day.status === ChallengeDayStatus.SETTLED
      ) {
        return day;
      }
      if (!day.freezeStartedAt) {
        throw new Error(`Daily challenge day ${dayId} has not started freezing`);
      }

      const next: DailyChallengeDay = {
        ...day,
        ...summary,
        status: ChallengeDayStatus.FROZEN,
        updatedAt: summary.frozenAt,
      };
      transaction.update(dayRef, {
        ...summary,
        status: next.status,
        updatedAt: summary.frozenAt,
      });
      return next;
    });
  }

  private toDay(snapshot: DocumentSnapshot<DocumentData>): DailyChallengeDay {
    const data = snapshot.data() as DailyChallengeDay;
    return {
      ...data,
      id: snapshot.id,
      startsAt: this.toDate(data.startsAt),
      endsAt: this.toDate(data.endsAt),
      closesAt: this.toDate(data.closesAt),
      freezeStartedAt: data.freezeStartedAt ? this.toDate(data.freezeStartedAt) : undefined,
      frozenAt: data.frozenAt ? this.toDate(data.frozenAt) : undefined,
      rewardingStartedAt: data.rewardingStartedAt
        ? this.toDate(data.rewardingStartedAt)
        : undefined,
      settledAt: data.settledAt ? this.toDate(data.settledAt) : undefined,
      createdAt: this.toDate(data.createdAt),
      updatedAt: this.toDate(data.updatedAt),
    };
  }

  private toContribution(
    snapshot: DocumentSnapshot<DocumentData>,
  ): DailyChallengeGlobalContribution {
    const data = snapshot.data() as DailyChallengeGlobalContribution;
    return {
      ...data,
      id: snapshot.id,
      createdAt: this.toDate(data.createdAt),
      updatedAt: this.toDate(data.updatedAt),
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
