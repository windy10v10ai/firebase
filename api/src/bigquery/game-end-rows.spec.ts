import { GameEndDto } from '../analytics/dto/game-end-dto';
import { SERVER_TYPE } from '../util/secret/secret.service';

import { buildGameEndRows } from './game-end-rows';

describe('buildGameEndRows', () => {
  const endedAt = new Date('2026-09-30T00:00:00Z');
  const context = { gameId: 'game-id', serverType: SERVER_TYPE.LOCAL, route: 'local' as const };
  const gameEnd = {
    matchId: '0',
    version: 'v4.00',
    difficulty: 6,
    gameOptions: {
      multiplierRadiant: 1.5,
      multiplierDire: 5,
      playerNumberRadiant: 1,
      playerNumberDire: 10,
      towerPowerPct: 200,
    },
    winnerTeamId: 2,
    gameTimeMsec: 1_800_000,
    playerCount: 1,
    countryCode: 'CN',
    players: [
      {
        steamId: 1001,
        teamId: 2,
        heroName: 'npc_dota_hero_axe',
        isDisconnected: false,
        level: 30,
        kills: 12.6,
        deaths: 1,
        assists: 3,
        score: 100,
        battlePoints: 300,
        lastHits: 400,
        heroDamage: 100_000,
        damageTaken: 50_000,
        healing: 0,
        towerKills: 3,
        totalGoldEarned: 40_000,
        stuns: 12.5,
        items: ['item_blink', ''],
        dailyTask: { dayId: '20260930', taskId: 't', star: 3, seasonPoint: 50 },
      },
      {
        steamId: 0,
        teamId: 3,
        heroName: 'npc_dota_hero_lina',
        isDisconnected: false,
        level: 25,
        kills: 2,
        deaths: 12,
        assists: 1,
        score: 0,
        battlePoints: 0,
        lastHits: 100,
        heroDamage: 20_000,
        damageTaken: 90_000,
        healing: 0,
        towerKills: 0,
        totalGoldEarned: 15_000,
      },
    ],
  } as unknown as GameEndDto;

  it('一个玩家一行，电脑也写，整局字段每行都带', () => {
    const rows = buildGameEndRows(gameEnd, context, endedAt);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      game_id: 'game-id',
      match_id: '0',
      ended_at: '2026-09-30T00:00:00.000Z',
      route: 'local',
      server_type: 'LOCAL',
      game_options: expect.objectContaining({ multiplier_radiant: 1.5, respawn_time_pct: null }),
      steam_id: 1001,
      is_winner: true,
      kills: 13,
      stuns: 12.5,
      daily_task_point: 50,
      items: ['item_blink', ''],
      abilities: [],
      strength: null,
    });
    expect(rows[1]).toMatchObject({ game_id: 'game-id', steam_id: 0, is_winner: false });
    expect(JSON.parse(rows[1].raw as string)).toMatchObject({
      matchId: '0',
      player: { heroName: 'npc_dota_hero_lina' },
    });
  });
});
