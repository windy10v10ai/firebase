import { HeroItemUsageDto } from '../game/dto/hero-item-usage.dto';

import { buildHeroItemUsageRow } from './hero-item-usage-row';

it('maps one request to one row and preserves item durations', () => {
  const usage: HeroItemUsageDto = {
    customMatchId: 'custom-match',
    version: 'v4.00',
    difficulty: 6,
    dotaTimeMsec: 60000,
    playerCount: 1,
    playerId: 10,
    steamId: 0,
    heroName: 'npc_dota_hero_axe',
    teamId: 3,
    isWin: false,
    items: [{ itemName: 'item_blink', durationSec: 120 }],
  };
  const recordedAt = new Date('2026-10-16T00:00:00Z');
  expect(buildHeroItemUsageRow(usage, recordedAt)).toEqual({
    recorded_at: recordedAt.toISOString(),
    custom_match_id: 'custom-match',
    version: 'v4.00',
    difficulty: 6,
    dota_time_msec: 60000,
    player_count: 1,
    player_id: 10,
    steam_id: 0,
    hero_name: 'npc_dota_hero_axe',
    team_id: 3,
    is_win: false,
    items: [{ item_name: 'item_blink', duration_sec: 120 }],
  });
  expect(buildHeroItemUsageRow({ ...usage, items: [] }, recordedAt).items).toEqual([]);
});
