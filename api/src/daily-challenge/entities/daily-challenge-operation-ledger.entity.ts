import { Collection } from 'fireorm';

import { DailyChallengeActionResult } from './player-daily-challenge.entity';

export type DailyChallengeOperationType = 'accept' | 'refresh' | 'view';

@Collection('daily_challenge_operation_ledger')
export class DailyChallengeOperationLedger {
  id: string;
  type: DailyChallengeOperationType;
  steamId: number;
  dayId: string;
  requestId: string;
  result: DailyChallengeActionResult;
  createdAt: Date;
}
