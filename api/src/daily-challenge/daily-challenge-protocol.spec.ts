import {
  ChallengeMetric,
  DAILY_CHALLENGE_MATCH_DATA_VERSION,
  DAILY_CHALLENGE_METRIC_MIN_DATA_VERSION,
} from './types/daily-challenge.types';

describe('daily challenge match contribution protocol', () => {
  it('publishes dataVersion 2 while keeping the complete metric vocabulary explicit', () => {
    expect(DAILY_CHALLENGE_MATCH_DATA_VERSION).toBe(2);
    expect(new Set(Object.values(ChallengeMetric))).toEqual(
      new Set([
        'hero_damage',
        'physical_damage',
        'magical_damage',
        'pure_damage',
        'damage_taken',
        'healing',
        'kills',
        'assists',
        'last_hits',
        'tower_kills',
        'bot_kills',
        'roshan_kills',
        'stun_duration_ms',
        'slow_duration_ms',
        'root_duration_ms',
        'silence_duration_ms',
        'taunt_duration_ms',
        'break_duration_ms',
        'debuff_duration_ms',
      ]),
    );
  });

  it.each([
    'physical_damage',
    'magical_damage',
    'pure_damage',
    'bot_kills',
    'roshan_kills',
    'stun_duration_ms',
    'slow_duration_ms',
    'root_duration_ms',
    'silence_duration_ms',
    'taunt_duration_ms',
    'break_duration_ms',
    'debuff_duration_ms',
  ])('requires dataVersion 2 for %s', (metric) => {
    expect((DAILY_CHALLENGE_METRIC_MIN_DATA_VERSION as Record<string, number>)[metric]).toBe(2);
  });
});
