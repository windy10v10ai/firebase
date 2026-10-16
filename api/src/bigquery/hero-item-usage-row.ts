import { HeroItemUsageDto } from '../game/dto/hero-item-usage.dto';

export function buildHeroItemUsageRow(
  usage: HeroItemUsageDto,
  recordedAt: Date,
): Record<string, unknown> {
  return {
    recorded_at: recordedAt.toISOString(),
    custom_match_id: usage.customMatchId,
    version: usage.version,
    difficulty: usage.difficulty,
    dota_time_msec: usage.dotaTimeMsec,
    player_count: usage.playerCount,
    player_id: usage.playerId,
    steam_id: usage.steamId,
    hero_name: usage.heroName,
    team_id: usage.teamId,
    is_win: usage.isWin,
    items: usage.items.map((item) => ({
      item_name: item.itemName,
      duration_sec: item.durationSec,
      late_duration_sec: item.lateDurationSec,
    })),
  };
}
