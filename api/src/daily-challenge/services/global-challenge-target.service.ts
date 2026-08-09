import { Injectable } from '@nestjs/common';

import { GlobalChallengeTargetPolicy } from '../types/daily-challenge-config.types';

export interface GlobalChallengeHistoryDay {
  effectiveParticipants: number;
}

export interface GlobalChallengeTargetOptions {
  previousTarget?: number;
  manualTarget?: number;
}

@Injectable()
export class GlobalChallengeTargetService {
  calculate(
    policy: GlobalChallengeTargetPolicy,
    history: GlobalChallengeHistoryDay[],
    options: GlobalChallengeTargetOptions = {},
  ): number {
    if (options.manualTarget !== undefined) {
      return this.clamp(Math.round(options.manualTarget), policy.minTarget, policy.maxTarget);
    }

    let target = policy.launchTarget;
    if (history.length >= 3) {
      const recent = history.slice(-7);
      const averageParticipants =
        recent.reduce((total, day) => total + day.effectiveParticipants, 0) / recent.length;
      target = Math.round(
        averageParticipants * policy.perPlayerExpectedContribution * policy.completionFactor,
      );
    }

    target = this.clamp(target, policy.minTarget, policy.maxTarget);
    if (options.previousTarget !== undefined) {
      const minimum = Math.round(options.previousTarget * (1 - policy.maxDailyChangeRatio));
      const maximum = Math.round(options.previousTarget * (1 + policy.maxDailyChangeRatio));
      target = this.clamp(target, minimum, maximum);
      target = this.clamp(target, policy.minTarget, policy.maxTarget);
    }
    return target;
  }

  private clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
  }
}
