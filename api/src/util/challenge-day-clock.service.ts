import { Injectable } from '@nestjs/common';

export interface ChallengeDayWindow {
  dayId: string;
  startsAt: Date;
  endsAt: Date;
  closesAt: Date;
}

@Injectable()
export class ChallengeDayClockService {
  private static readonly CLOSING_GRACE_MINUTES = 120;

  getWindow(now: Date = new Date()): ChallengeDayWindow {
    const startsAt = new Date(now);
    startsAt.setHours(0, 0, 0, 0);

    const endsAt = new Date(startsAt);
    endsAt.setDate(endsAt.getDate() + 1);

    const closesAt = new Date(endsAt);
    closesAt.setMinutes(closesAt.getMinutes() + ChallengeDayClockService.CLOSING_GRACE_MINUTES);

    return {
      dayId: this.formatLocalDate(startsAt),
      startsAt,
      endsAt,
      closesAt,
    };
  }

  isCurrentDay(timestamp: Date | undefined, now: Date = new Date()): boolean {
    if (!timestamp) {
      return false;
    }
    const { startsAt, endsAt } = this.getWindow(now);
    return timestamp >= startsAt && timestamp < endsAt;
  }

  private formatLocalDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
