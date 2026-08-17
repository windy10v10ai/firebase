import { getUtcDayId } from './date';

describe('getUtcDayId', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('formats a UTC date as YYYYMMDD with leading zeroes', () => {
    expect(getUtcDayId(new Date('2026-01-02T03:04:05.000Z'))).toBe('20260102');
  });

  it('uses the UTC calendar day for dates with a timezone offset', () => {
    expect(getUtcDayId(new Date('2026-08-18T00:30:00+09:00'))).toBe('20260817');
  });

  it('uses the current time when no date is provided', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-17T23:59:59.999Z'));

    expect(getUtcDayId()).toBe('20260817');
  });
});
