import { Injectable } from '@nestjs/common';

import { DailyChallengeStreakMilestone } from '../types/daily-challenge-config.types';

export interface DailyChallengeStreakSettlementInput {
  dayId: string;
  completed: boolean;
  previousDays: number;
  previousCycleId?: string;
  milestones: DailyChallengeStreakMilestone[];
}

export interface DailyChallengeStreakSettlementResult {
  storedDays: number;
  cycleId: string;
  milestone?: DailyChallengeStreakMilestone;
  cycleCompleted?: boolean;
}

@Injectable()
export class DailyChallengeStreakService {
  settle(input: DailyChallengeStreakSettlementInput): DailyChallengeStreakSettlementResult {
    const milestones = [...input.milestones].sort((left, right) => left.days - right.days);
    const highestMilestone = milestones[milestones.length - 1];
    if (!highestMilestone) {
      throw new Error('Daily challenge streak milestones are missing');
    }

    if (!input.completed) {
      return {
        storedDays: 0,
        cycleId: input.dayId,
      };
    }

    const previousDays = Math.max(0, Math.trunc(input.previousDays));
    const completedDays = previousDays + 1;
    const cycleId = previousDays > 0 && input.previousCycleId ? input.previousCycleId : input.dayId;
    const milestone = milestones.find(({ days }) => days === completedDays);
    const cycleCompleted = completedDays >= highestMilestone.days;

    return {
      storedDays: cycleCompleted ? 0 : completedDays,
      cycleId,
      ...(milestone ? { milestone: { ...milestone } } : {}),
      ...(cycleCompleted ? { cycleCompleted: true } : {}),
    };
  }
}
