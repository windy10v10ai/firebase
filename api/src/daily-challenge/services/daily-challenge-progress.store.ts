import { Injectable } from '@nestjs/common';
import { DocumentData, DocumentSnapshot, Timestamp, getFirestore } from 'firebase-admin/firestore';

import { DailyChallengeGlobalContribution } from '../entities/daily-challenge-global-contribution.entity';
import { DailyChallengeMatchLedger } from '../entities/daily-challenge-match-ledger.entity';
import { DailyChallengeRewardLedger } from '../entities/daily-challenge-reward-ledger.entity';
import { PlayerDailyChallenge } from '../entities/player-daily-challenge.entity';

import {
  normalizeDailyChallengePlayerStateData,
  sanitizeDailyChallengeFirestoreDocument,
} from './daily-challenge-player.store';
import {
  DailyChallengeRewardGrantResult,
  DailyChallengeRewardStore,
} from './daily-challenge-reward.store';

export interface DailyChallengeMatchContributionMutation {
  state?: PlayerDailyChallenge;
  globalContribution?: DailyChallengeGlobalContribution;
  personalReward?: DailyChallengeRewardLedger;
  ledger: Omit<DailyChallengeMatchLedger, 'id'>;
}

export interface DailyChallengeMatchContributionResult {
  ledger: DailyChallengeMatchLedger;
  ledgerCreated: boolean;
  personalRewardGrant?: DailyChallengeRewardGrantResult;
}

type MatchContributionMutator = (
  state: PlayerDailyChallenge | null,
  globalContribution: DailyChallengeGlobalContribution | null,
) => DailyChallengeMatchContributionMutation;

@Injectable()
export class DailyChallengeProgressStore {
  private readonly stateCollection = 'player_daily_challenges';
  private readonly ledgerCollection = 'daily_challenge_match_ledger';
  private readonly globalContributionCollection = 'daily_challenge_global_contributions';
  private readonly dayCollection = 'daily_challenge_days';

  constructor(private readonly rewardStore: DailyChallengeRewardStore) {}

  async getState(stateId: string): Promise<PlayerDailyChallenge | null> {
    const snapshot = await getFirestore().collection(this.stateCollection).doc(stateId).get();
    return snapshot.exists ? this.toState(snapshot) : null;
  }

  async runMatchContribution(
    ledgerId: string,
    stateId: string,
    mutate: MatchContributionMutator,
  ): Promise<DailyChallengeMatchContributionResult>;
  async runMatchContribution(
    ledgerId: string,
    stateId: string,
    globalContributionId: string,
    mutate: MatchContributionMutator,
  ): Promise<DailyChallengeMatchContributionResult>;
  async runMatchContribution(
    ledgerId: string,
    stateId: string,
    globalContributionIdOrMutate: string | MatchContributionMutator,
    maybeMutate?: MatchContributionMutator,
  ): Promise<DailyChallengeMatchContributionResult> {
    const db = getFirestore();
    const ledgerRef = db.collection(this.ledgerCollection).doc(ledgerId);
    const stateRef = db.collection(this.stateCollection).doc(stateId);
    const globalContributionId =
      typeof globalContributionIdOrMutate === 'string' ? globalContributionIdOrMutate : undefined;
    const mutate = maybeMutate ?? (globalContributionIdOrMutate as MatchContributionMutator);
    const globalContributionRef = globalContributionId
      ? db.collection(this.globalContributionCollection).doc(globalContributionId)
      : undefined;
    const dayId = globalContributionId ? this.getDayId(stateId) : undefined;
    const dayRef = dayId ? db.collection(this.dayCollection).doc(dayId) : undefined;

    return db.runTransaction(async (transaction) => {
      const ledgerSnapshot = await transaction.get(ledgerRef);
      if (ledgerSnapshot.exists) {
        return { ledger: this.toLedger(ledgerSnapshot), ledgerCreated: false };
      }

      if (dayRef) {
        const daySnapshot = await transaction.get(dayRef);
        const day = daySnapshot.exists ? daySnapshot.data() : undefined;
        if (
          day?.freezeStartedAt ||
          day?.status === 'frozen' ||
          day?.status === 'rewarding' ||
          day?.status === 'settled'
        ) {
          const mutation = mutate(null, null);
          const stored = this.toStoredLedger(ledgerId, mutation, false);
          transaction.create(ledgerRef, sanitizeDailyChallengeFirestoreDocument(stored));
          return { ledger: stored, ledgerCreated: true };
        }
      }

      const stateSnapshot = await transaction.get(stateRef);
      const globalContributionSnapshot = globalContributionRef
        ? await transaction.get(globalContributionRef)
        : undefined;
      const mutation = mutate(
        stateSnapshot.exists ? this.toState(stateSnapshot) : null,
        globalContributionSnapshot?.exists
          ? this.toGlobalContribution(globalContributionSnapshot)
          : null,
      );
      const personalRewardGrant = mutation.personalReward
        ? await this.rewardStore.grantInTransaction(transaction, mutation.personalReward)
        : undefined;

      if (mutation.state) {
        transaction.set(stateRef, sanitizeDailyChallengeFirestoreDocument(mutation.state));
      }
      if (mutation.globalContribution && globalContributionRef) {
        transaction.set(
          globalContributionRef,
          sanitizeDailyChallengeFirestoreDocument(mutation.globalContribution),
        );
      }

      const stored = this.toStoredLedger(ledgerId, mutation, true);
      transaction.create(ledgerRef, sanitizeDailyChallengeFirestoreDocument(stored));
      return {
        ledger: stored,
        ledgerCreated: true,
        ...(personalRewardGrant ? { personalRewardGrant } : {}),
      };
    });
  }

  private getDayId(stateId: string): string {
    const separatorIndex = stateId.lastIndexOf('_');
    if (separatorIndex <= 0) {
      throw new Error(`Invalid daily challenge state id ${stateId}`);
    }
    return stateId.slice(0, separatorIndex);
  }

  private toStoredLedger(
    ledgerId: string,
    mutation: DailyChallengeMatchContributionMutation,
    persistPersonalRewardMarker: boolean,
  ): DailyChallengeMatchLedger {
    return {
      ...mutation.ledger,
      id: ledgerId,
      ...(persistPersonalRewardMarker && mutation.personalReward
        ? { personalRewardLedgerId: mutation.personalReward.id }
        : {}),
    };
  }

  private toState(snapshot: DocumentSnapshot<DocumentData>): PlayerDailyChallenge {
    return normalizeDailyChallengePlayerStateData(
      snapshot.data() as Partial<PlayerDailyChallenge> & Record<string, unknown>,
      snapshot.id,
    );
  }

  private toGlobalContribution(
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

  private toLedger(snapshot: DocumentSnapshot<DocumentData>): DailyChallengeMatchLedger {
    const data = snapshot.data() as DailyChallengeMatchLedger;
    return {
      ...data,
      id: snapshot.id,
      createdAt: this.toDate(data.createdAt),
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
