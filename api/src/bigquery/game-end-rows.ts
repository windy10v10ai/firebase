import { randomUUID } from 'crypto';

import { GameEndDto, GameEndPlayerDto } from '../analytics/dto/game-end-dto';
import { SERVER_TYPE } from '../util/secret/secret.service';

export type GameEndRoute = 'official' | 'local' | 'proxy';

export interface GameEndRecordContext {
  gameId: string;
  serverType: SERVER_TYPE;
  route: GameEndRoute;
}

/** 每次结算生成一个 gameId，同一次结算的战绩行与积分记录共用它。 */
export function createGameEndRecordContext(
  serverType: SERVER_TYPE,
  route: GameEndRoute,
): GameEndRecordContext {
  return { gameId: randomUUID(), serverType, route };
}

// 客户端报文里的数字没有逐个校验整数，写 INT64 列前先取整，免得一个小数让整批写入失败
function toInt(value: unknown): number | null {
  const num = Number(value);
  return value == null || !Number.isFinite(num) ? null : Math.round(num);
}

function toFloat(value: unknown): number | null {
  const num = Number(value);
  return value == null || !Number.isFinite(num) ? null : num;
}

/** 把一次结算拆成每个玩家（含电脑）一行。 */
export function buildGameEndRows(
  gameEnd: GameEndDto,
  context: GameEndRecordContext,
  endedAt: Date,
): Record<string, unknown>[] {
  const { players, ...match } = gameEnd;
  const options = gameEnd.gameOptions;
  const matchColumns = {
    game_id: context.gameId,
    match_id: String(gameEnd.matchId),
    ended_at: endedAt.toISOString(),
    version: gameEnd.version,
    difficulty: toInt(gameEnd.difficulty),
    server_type: context.serverType,
    route: context.route,
    country: gameEnd.countryCode ?? null,
    player_count: toInt(gameEnd.playerCount),
    winner_team_id: toInt(gameEnd.winnerTeamId),
    game_time_msec: toInt(gameEnd.gameTimeMsec),
    game_options: options
      ? {
          multiplier_radiant: toFloat(options.multiplierRadiant),
          multiplier_dire: toFloat(options.multiplierDire),
          player_number_radiant: toInt(options.playerNumberRadiant),
          player_number_dire: toInt(options.playerNumberDire),
          tower_power_pct: toInt(options.towerPowerPct),
          respawn_time_pct: toInt(options.respawnTimePct),
        }
      : null,
  };

  return players.map((player) => ({
    ...matchColumns,
    ...buildPlayerColumns(player, gameEnd.winnerTeamId),
    raw: JSON.stringify({ ...match, player }),
  }));
}

function buildPlayerColumns(player: GameEndPlayerDto, winnerTeamId: number) {
  return {
    steam_id: toInt(player.steamId) ?? 0,
    team_id: toInt(player.teamId),
    hero_name: player.heroName ?? null,
    is_winner: player.teamId === winnerTeamId,
    is_disconnected: player.isDisconnected ?? null,
    level: toInt(player.level),
    score: toInt(player.score),
    battle_points: toInt(player.battlePoints),
    daily_task_point: toInt(player.dailyTask?.seasonPoint),
    awaken: toInt(player.awaken),
    kills: toInt(player.kills),
    deaths: toInt(player.deaths),
    assists: toInt(player.assists),
    last_hits: toInt(player.lastHits),
    hero_damage: toInt(player.heroDamage),
    damage_taken: toInt(player.damageTaken),
    healing: toInt(player.healing),
    tower_kills: toInt(player.towerKills),
    total_gold_earned: toInt(player.totalGoldEarned),
    stuns: toFloat(player.stuns),
    roshan_kills: toInt(player.roshanKills),
    strength: toInt(player.strength),
    agility: toInt(player.agility),
    intellect: toInt(player.intellect),
    items: player.items ?? [],
    neutral_item: player.neutralItem ?? null,
    neutral_passive_item: player.neutralPassiveItem ?? null,
    abilities: player.abilities ?? [],
  };
}
