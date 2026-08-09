import { Injectable } from '@nestjs/common';
import { DocumentData, DocumentSnapshot, Timestamp, getFirestore } from 'firebase-admin/firestore';

import { DailyChallengeDay } from '../entities/daily-challenge-day.entity';

@Injectable()
export class DailyChallengeDayStore {
  private readonly collection = 'daily_challenge_days';

  async getOrCreate(dayId: string, factory: () => DailyChallengeDay): Promise<DailyChallengeDay> {
    const ref = getFirestore().collection(this.collection).doc(dayId);
    return getFirestore().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (snapshot.exists) {
        return this.toDay(snapshot);
      }
      const day = factory();
      transaction.create(ref, day);
      return day;
    });
  }

  async get(dayId: string): Promise<DailyChallengeDay | null> {
    const snapshot = await getFirestore().collection(this.collection).doc(dayId).get();
    return snapshot.exists ? this.toDay(snapshot) : null;
  }

  private toDay(snapshot: DocumentSnapshot<DocumentData>): DailyChallengeDay {
    const data = snapshot.data() as DailyChallengeDay;
    return {
      ...data,
      id: snapshot.id,
      startsAt: this.toDate(data.startsAt),
      endsAt: this.toDate(data.endsAt),
      closesAt: this.toDate(data.closesAt),
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
