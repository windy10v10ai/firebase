import { ChallengeDayClockService } from './challenge-day-clock.service';

describe('ChallengeDayClockService', () => {
  const service = new ChallengeDayClockService();

  it('uses the same local-midnight boundary as the existing daily member reward', () => {
    const now = new Date(2026, 7, 4, 23, 45, 12, 345);

    const window = service.getWindow(now);

    expect(window.dayId).toBe('2026-08-04');
    expect(window.startsAt).toEqual(new Date(2026, 7, 4, 0, 0, 0, 0));
    expect(window.endsAt).toEqual(new Date(2026, 7, 5, 0, 0, 0, 0));
    expect(window.closesAt).toEqual(new Date(2026, 7, 5, 2, 0, 0, 0));
  });

  it('treats timestamps before the current boundary as a previous challenge day', () => {
    const now = new Date(2026, 7, 4, 8, 0, 0, 0);

    expect(service.isCurrentDay(new Date(2026, 7, 4, 0, 0, 0, 0), now)).toBe(true);
    expect(service.isCurrentDay(new Date(2026, 7, 3, 23, 59, 59, 999), now)).toBe(false);
  });
});
