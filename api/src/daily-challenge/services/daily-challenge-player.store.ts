import { createHash } from 'crypto';

import { Injectable } from '@nestjs/common';
import { DocumentData, DocumentSnapshot, Timestamp, getFirestore } from 'firebase-admin/firestore';

import { DailyChallengeTaskSnapshotDto } from '../dto/daily-challenge-task-snapshot.dto';
import { DailyChallengeOperationType } from '../entities/daily-challenge-operation-ledger.entity';
import {
  DailyChallengeAccountState,
  DailyChallengeActionResult,
  PlayerDailyChallenge,
} from '../entities/player-daily-challenge.entity';
import {
  DAILY_CHALLENGE_SNAPSHOT_VERSION,
  DailyChallengePersonalStar,
} from '../types/daily-challenge.types';

export function sanitizeDailyChallengeFirestoreDocument<T>(value: T): T {
  if (
    value === null ||
    value === undefined ||
    value instanceof Date ||
    value instanceof Timestamp
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => sanitizeDailyChallengeFirestoreDocument(item)) as T;
  }
  if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, sanitizeDailyChallengeFirestoreDocument(item)]),
  ) as T;
}

const DEFAULT_PERSONAL_CHALLENGE_ROUNDS = 3;

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isDailyChallengePersonalStar(value: unknown): value is DailyChallengePersonalStar {
  return value === 1 || value === 2 || value === 3;
}

function normalizeRound(value: unknown, fallback: number, totalRounds: number): number {
  if (!isPositiveInteger(value)) {
    return fallback;
  }
  return Math.min(totalRounds, Math.max(1, value));
}

function normalizeTaskSnapshot(
  value: unknown,
  fallbackRound: number,
  totalRounds: number,
): DailyChallengeTaskSnapshotDto | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const task = value as DailyChallengeTaskSnapshotDto;
  return {
    ...task,
    star: isDailyChallengePersonalStar(task.star) ? task.star : 2,
    round: normalizeRound(task.round, fallbackRound, totalRounds),
    totalRounds,
  };
}

function normalizeTaskSnapshots(
  value: unknown,
  fallbackRound: (index: number) => number,
  totalRounds: number,
): DailyChallengeTaskSnapshotDto[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((task, index) => {
    const normalized = normalizeTaskSnapshot(task, fallbackRound(index), totalRounds);
    return normalized ? [normalized] : [];
  });
}

function taskSnapshotNeedsMigration(
  raw: unknown,
  normalized: DailyChallengeTaskSnapshotDto,
): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return true;
  }
  const task = raw as Partial<DailyChallengeTaskSnapshotDto>;
  return (
    task.star !== normalized.star ||
    task.round !== normalized.round ||
    task.totalRounds !== normalized.totalRounds
  );
}

function taskSnapshotsNeedMigration(
  raw: unknown,
  normalized: DailyChallengeTaskSnapshotDto[],
): boolean {
  if (!Array.isArray(raw) || raw.length !== normalized.length) {
    return true;
  }
  return normalized.some((task, index) => taskSnapshotNeedsMigration(raw[index], task));
}

export function toDailyChallengeDate(value: unknown): Date {
  if (value instanceof Date) {
    return value;
  }
  if (value instanceof Timestamp) {
    return value.toDate();
  }
  return new Date(value as string | number);
}

/**
 * Keeps existing player documents readable while the personal challenge schema evolves.
 */
export function normalizeDailyChallengePlayerStateData(
  raw: Partial<PlayerDailyChallenge> & Record<string, unknown>,
  id: string,
): PlayerDailyChallenge {
  const totalRounds = isPositiveInteger(raw.totalRounds)
    ? raw.totalRounds
    : DEFAULT_PERSONAL_CHALLENGE_ROUNDS;
  const completedAt = raw.completedAt ? toDailyChallengeDate(raw.completedAt) : undefined;
  const completedTasks = normalizeTaskSnapshots(
    raw.completedTasks,
    (index) => Math.min(totalRounds, index + 1),
    totalRounds,
  ).slice(0, totalRounds);
  const rawCompletedRoundCount = isPositiveInteger(raw.completedRoundCount)
    ? raw.completedRoundCount
    : completedTasks.length;
  const completedRoundCount = completedAt
    ? totalRounds
    : Math.min(totalRounds, rawCompletedRoundCount);
  const currentRound = completedAt ? totalRounds : Math.min(totalRounds, completedRoundCount + 1);
  const candidates = completedAt
    ? []
    : normalizeTaskSnapshots(raw.candidates, () => currentRound, totalRounds);
  const acceptedTask = completedAt
    ? undefined
    : normalizeTaskSnapshot(raw.acceptedTask, currentRound, totalRounds);

  return {
    ...raw,
    id,
    schemaVersion: DAILY_CHALLENGE_SNAPSHOT_VERSION,
    startsAt: toDailyChallengeDate(raw.startsAt),
    endsAt: toDailyChallengeDate(raw.endsAt),
    totalRounds,
    currentRound,
    completedRoundCount,
    completedTasks,
    candidates,
    acceptedTask,
    acceptedAt: acceptedTask && raw.acceptedAt ? toDailyChallengeDate(raw.acceptedAt) : undefined,
    progress: completedAt ? 0 : Number(raw.progress ?? 0),
    completedAt,
    settlementProcessedAt: raw.settlementProcessedAt
      ? toDailyChallengeDate(raw.settlementProcessedAt)
      : undefined,
    unreadRewardCount: Number(raw.unreadRewardCount ?? 0),
    streakDays: Number(raw.streakDays ?? 0),
    streakMilestones: Array.isArray(raw.streakMilestones) ? raw.streakMilestones : [],
    createdAt: toDailyChallengeDate(raw.createdAt),
    updatedAt: toDailyChallengeDate(raw.updatedAt),
  } as PlayerDailyChallenge;
}

export function dailyChallengePlayerStateNeedsMigration(
  raw: Partial<PlayerDailyChallenge> & Record<string, unknown>,
  normalized: PlayerDailyChallenge,
): boolean {
  if (
    raw.schemaVersion !== DAILY_CHALLENGE_SNAPSHOT_VERSION ||
    raw.totalRounds !== normalized.totalRounds ||
    raw.currentRound !== normalized.currentRound ||
    raw.completedRoundCount !== normalized.completedRoundCount ||
    taskSnapshotsNeedMigration(raw.completedTasks, normalized.completedTasks) ||
    taskSnapshotsNeedMigration(raw.candidates, normalized.candidates)
  ) {
    return true;
  }

  if (normalized.acceptedTask) {
    if (taskSnapshotNeedsMigration(raw.acceptedTask, normalized.acceptedTask)) {
      return true;
    }
  } else if (raw.acceptedTask !== undefined || raw.acceptedAt !== undefined) {
    return true;
  }

  return Boolean(
    normalized.completedAt &&
    (raw.candidates === undefined ||
      (Array.isArray(raw.candidates) && raw.candidates.length > 0) ||
      raw.progress !== 0),
  );
}

export interface DailyChallengeOperationContext extends DailyChallengeAccountState {
  state: PlayerDailyChallenge | null;
}

export interface DailyChallengeStoredOperation {
  id: string;
  type: DailyChallengeOperationType;
  steamId: number;
  dayId: string;
  requestId: string;
  result: DailyChallengeActionResult;
  createdAt: Date;
}

export interface DailyChallengeOperationMutation {
  state: PlayerDailyChallenge;
  player?: DailyChallengeAccountState['player'];
  operation: Omit<DailyChallengeStoredOperation, 'id'>;
}

@Injectable()
export class DailyChallengePlayerStore {
  private readonly stateCollection = 'player_daily_challenges';
  private readonly operationCollection = 'daily_challenge_operation_ledger';
  private readonly playerCollection = 'Players';
  private readonly memberCollection = 'Members';

  async getOrCreateState(
    id: string,
    factory: () => PlayerDailyChallenge,
  ): Promise<PlayerDailyChallenge> {
    const db = getFirestore();
    const stateRef = db.collection(this.stateCollection).doc(id);
    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(stateRef);
      if (snapshot.exists) {
        const normalized = this.readState(snapshot);
        if (normalized.needsMigration) {
          transaction.set(stateRef, sanitizeDailyChallengeFirestoreDocument(normalized.state), {
            merge: true,
          });
        }
        return normalized.state;
      }
      const state = factory();
      transaction.create(stateRef, sanitizeDailyChallengeFirestoreDocument(state));
      return state;
    });
  }

  async getState(id: string): Promise<PlayerDailyChallenge | null> {
    const snapshot = await getFirestore().collection(this.stateCollection).doc(id).get();
    return snapshot.exists ? this.toState(snapshot) : null;
  }

  async getAccountState(steamId: number): Promise<DailyChallengeAccountState> {
    const db = getFirestore();
    const id = steamId.toString();
    const [memberSnapshot, playerSnapshot] = await Promise.all([
      db.collection(this.memberCollection).doc(id).get(),
      db.collection(this.playerCollection).doc(id).get(),
    ]);
    return this.toAccountState(steamId, memberSnapshot, playerSnapshot);
  }

  async runOperation(
    operationId: string,
    stateId: string,
    steamId: number,
    mutate: (context: DailyChallengeOperationContext) => DailyChallengeOperationMutation,
  ): Promise<DailyChallengeStoredOperation> {
    const db = getFirestore();
    const safeOperationId = this.hashId(operationId);
    const stateRef = db.collection(this.stateCollection).doc(stateId);
    const operationRef = db.collection(this.operationCollection).doc(safeOperationId);
    const playerRef = db.collection(this.playerCollection).doc(steamId.toString());
    const memberRef = db.collection(this.memberCollection).doc(steamId.toString());

    return db.runTransaction(async (transaction) => {
      const operationSnapshot = await transaction.get(operationRef);
      if (operationSnapshot.exists) {
        return this.toOperation(operationSnapshot);
      }

      const [stateSnapshot, memberSnapshot, playerSnapshot] = await transaction.getAll(
        stateRef,
        memberRef,
        playerRef,
      );

      const mutation = mutate({
        state: stateSnapshot.exists ? this.toState(stateSnapshot) : null,
        ...this.toAccountState(steamId, memberSnapshot, playerSnapshot),
      });
      transaction.set(stateRef, sanitizeDailyChallengeFirestoreDocument(mutation.state));
      if (mutation.player) {
        transaction.set(playerRef, sanitizeDailyChallengeFirestoreDocument(mutation.player), {
          merge: true,
        });
      }
      const stored: DailyChallengeStoredOperation = {
        id: safeOperationId,
        ...mutation.operation,
      };
      transaction.create(operationRef, sanitizeDailyChallengeFirestoreDocument(stored));
      return stored;
    });
  }

  private toAccountState(
    steamId: number,
    memberSnapshot: DocumentSnapshot<DocumentData>,
    playerSnapshot: DocumentSnapshot<DocumentData>,
  ): DailyChallengeAccountState {
    const memberData = memberSnapshot.data();
    const playerData = playerSnapshot.data();
    return {
      member: memberSnapshot.exists
        ? {
            id: memberSnapshot.id,
            steamId,
            level: Number(memberData?.level ?? 0),
            expireDate: this.toDate(memberData?.expireDate),
          }
        : null,
      player: {
        id: playerSnapshot.id || steamId.toString(),
        memberPointTotal: Number(playerData?.memberPointTotal ?? 0),
        usedMemberPoint: Number(playerData?.usedMemberPoint ?? 0),
      },
    };
  }

  private readState(snapshot: DocumentSnapshot<DocumentData>): {
    state: PlayerDailyChallenge;
    needsMigration: boolean;
  } {
    const raw = snapshot.data() as Partial<PlayerDailyChallenge> & Record<string, unknown>;
    const state = normalizeDailyChallengePlayerStateData(raw, snapshot.id);
    return {
      state,
      needsMigration: dailyChallengePlayerStateNeedsMigration(raw, state),
    };
  }

  private toState(snapshot: DocumentSnapshot<DocumentData>): PlayerDailyChallenge {
    return this.readState(snapshot).state;
  }

  private toOperation(snapshot: DocumentSnapshot<DocumentData>): DailyChallengeStoredOperation {
    const data = snapshot.data() as DailyChallengeStoredOperation;
    return {
      ...data,
      id: snapshot.id,
      createdAt: this.toDate(data.createdAt),
    };
  }

  private toDate(value: unknown): Date {
    return toDailyChallengeDate(value);
  }

  private hashId(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
