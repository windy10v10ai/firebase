import { Injectable } from '@nestjs/common';
import { DocumentData, DocumentSnapshot, Timestamp, getFirestore } from 'firebase-admin/firestore';

import { DailyChallengeDay } from '../entities/daily-challenge-day.entity';
import { DailyChallengeGlobalRanking } from '../entities/daily-challenge-global-ranking.entity';
import { PlayerDailyChallenge } from '../entities/player-daily-challenge.entity';
import { ChallengeDayStatus } from '../types/daily-challenge.types';

import {
  normalizeDailyChallengePlayerStateData,
  sanitizeDailyChallengeFirestoreDocument,
} from './daily-challenge-player.store';

export interface DailyChallengePlayerSettlementFields {
  streakDays: number;
  streakCycleId: string;
  streakRewardDays?: number;
  streakRewardSeasonPoint?: number;
  settlementProcessedAt: Date;
  updatedAt: Date;
}

type PlayerSettlementCalculator = (
  current: PlayerDailyChallenge,
  previous: PlayerDailyChallenge | null,
) => DailyChallengePlayerSettlementFields;

@Injectable()
export class DailyChallengeSettlementStore {
  private readonly dayCollection = 'daily_challenge_days';
  private readonly stateCollection = 'player_daily_challenges';
  private readonly rankingCollection = 'daily_challenge_global_rankings';

  async listEndedDays(now: Date, limit = 14): Promise<DailyChallengeDay[]> {
    if (limit <= 0) {
      return [];
    }

    const db = getFirestore();
    const endedDays: DailyChallengeDay[] = [];
    const pageSize = Math.max(1, limit);
    let cursor: DocumentSnapshot<DocumentData> | undefined;

    while (endedDays.length < limit) {
      let query = db
        .collection(this.dayCollection)
        .where('endsAt', '<=', now)
        .orderBy('endsAt', 'asc')
        .limit(pageSize);
      if (cursor) {
        query = query.startAfter(cursor);
      }

      const snapshot = await query.get();
      if (snapshot.empty) {
        break;
      }
      endedDays.push(
        ...snapshot.docs
          .map((document) => this.toDay(document))
          .filter(({ status }) => status !== ChallengeDayStatus.SETTLED),
      );
      cursor = snapshot.docs[snapshot.docs.length - 1];
      if (snapshot.docs.length < pageSize) {
        break;
      }
    }

    return endedDays.slice(0, limit);
  }

  async markClosing(dayId: string, now: Date): Promise<DailyChallengeDay> {
    return this.updateDay(dayId, (day) => {
      if (day.status !== ChallengeDayStatus.OPEN || now.getTime() < day.endsAt.getTime()) {
        return day;
      }
      return { ...day, status: ChallengeDayStatus.CLOSING, updatedAt: now };
    });
  }

  async beginRewarding(dayId: string, now: Date): Promise<DailyChallengeDay> {
    return this.updateDay(dayId, (day) => {
      if (
        day.status === ChallengeDayStatus.REWARDING ||
        day.status === ChallengeDayStatus.SETTLED
      ) {
        return day;
      }
      if (day.status !== ChallengeDayStatus.FROZEN) {
        throw new Error(`Daily challenge day ${dayId} is not frozen`);
      }
      return {
        ...day,
        status: ChallengeDayStatus.REWARDING,
        rewardingStartedAt: day.rewardingStartedAt ?? now,
        updatedAt: now,
      };
    });
  }

  async listPlayerStates(dayId: string): Promise<PlayerDailyChallenge[]> {
    const snapshot = await getFirestore()
      .collection(this.stateCollection)
      .where('dayId', '==', dayId)
      .get();
    return snapshot.docs.map((document) => this.toState(document));
  }

  async preparePlayerSettlement(
    stateId: string,
    previousStateId: string,
    now: Date,
    calculate: PlayerSettlementCalculator,
  ): Promise<PlayerDailyChallenge> {
    const db = getFirestore();
    const stateRef = db.collection(this.stateCollection).doc(stateId);
    const previousRef = db.collection(this.stateCollection).doc(previousStateId);
    return db.runTransaction(async (transaction) => {
      const [stateSnapshot, previousSnapshot] = await transaction.getAll(stateRef, previousRef);
      if (!stateSnapshot.exists) {
        throw new Error(`Daily challenge player state ${stateId} does not exist`);
      }
      const state = this.toState(stateSnapshot);
      if (state.settlementProcessedAt) {
        return state;
      }

      const fields = calculate(
        state,
        previousSnapshot.exists ? this.toState(previousSnapshot) : null,
      );
      const next = { ...state, ...fields, updatedAt: now };
      transaction.set(stateRef, sanitizeDailyChallengeFirestoreDocument(fields), { merge: true });
      return next;
    });
  }

  async *streamGlobalRankingPages(
    dayId: string,
    requestedPageSize = 500,
  ): AsyncGenerator<DailyChallengeGlobalRanking[]> {
    const db = getFirestore();
    const pageSize = Math.min(500, Math.max(1, Math.trunc(requestedPageSize)));
    let cursor: DocumentSnapshot<DocumentData> | undefined;

    while (true) {
      let query = db
        .collection(this.rankingCollection)
        .where('dayId', '==', dayId)
        .orderBy('steamId', 'asc')
        .limit(pageSize);
      if (cursor) {
        query = query.startAfter(cursor);
      }

      const snapshot = await query.get();
      if (snapshot.docs.length === 0) {
        break;
      }
      yield snapshot.docs.map((document) => this.toRanking(document));
      cursor = snapshot.docs[snapshot.docs.length - 1];
      if (snapshot.docs.length < pageSize) {
        break;
      }
    }
  }

  async completeDay(dayId: string, now: Date): Promise<DailyChallengeDay> {
    return this.updateDay(dayId, (day) => {
      if (day.status === ChallengeDayStatus.SETTLED) {
        return day;
      }
      if (day.status !== ChallengeDayStatus.REWARDING) {
        throw new Error(`Daily challenge day ${dayId} is not rewarding`);
      }
      return {
        ...day,
        status: ChallengeDayStatus.SETTLED,
        settledAt: day.settledAt ?? now,
        updatedAt: now,
      };
    });
  }

  private async updateDay(
    dayId: string,
    update: (day: DailyChallengeDay) => DailyChallengeDay,
  ): Promise<DailyChallengeDay> {
    const db = getFirestore();
    const ref = db.collection(this.dayCollection).doc(dayId);
    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) {
        throw new Error(`Daily challenge day ${dayId} does not exist`);
      }
      const current = this.toDay(snapshot);
      const next = update(current);
      if (next !== current) {
        transaction.set(ref, sanitizeDailyChallengeFirestoreDocument(next), { merge: true });
      }
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

  private toState(snapshot: DocumentSnapshot<DocumentData>): PlayerDailyChallenge {
    return normalizeDailyChallengePlayerStateData(
      snapshot.data() as Partial<PlayerDailyChallenge> & Record<string, unknown>,
      snapshot.id,
    );
  }

  private toRanking(snapshot: DocumentSnapshot<DocumentData>): DailyChallengeGlobalRanking {
    const data = snapshot.data() as DailyChallengeGlobalRanking;
    return {
      ...data,
      id: snapshot.id,
      frozenAt: this.toDate(data.frozenAt),
    };
  }

  private toDate(value: unknown): Date {
    if (value instanceof Date) return value;
    if (value instanceof Timestamp) return value.toDate();
    return new Date(value as string | number);
  }
}
