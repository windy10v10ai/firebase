import { Injectable } from '@nestjs/common';
import { AggregateField, getFirestore } from 'firebase-admin/firestore';

import { ChallengeMetric } from '../types/daily-challenge.types';

export interface DailyChallengeGlobalProgressQuery {
  dayId: string;
  assignmentId: string;
  metric: ChallengeMetric;
}

@Injectable()
export class DailyChallengeGlobalProgressStore {
  private readonly contributionCollection = 'daily_challenge_global_contributions';

  async getCurrentProgress(query: DailyChallengeGlobalProgressQuery): Promise<number> {
    const snapshot = await getFirestore()
      .collection(this.contributionCollection)
      .where('dayId', '==', query.dayId)
      .where('assignmentId', '==', query.assignmentId)
      .where('metric', '==', query.metric)
      .aggregate({ total: AggregateField.sum('value') })
      .get();
    const total = Number(snapshot.data().total ?? 0);
    return Number.isFinite(total) ? Math.max(0, total) : 0;
  }
}
