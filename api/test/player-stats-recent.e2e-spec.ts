import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { createIdTokenForSteamId } from './util/util-auth';
import { get, initTest, post } from './util/util-http';
import { createPlayer } from './util/util-player';

const gameEndUrl = '/api/game/end';
const recentUrl = (steamId: number) => `/api/player/${steamId}/stats/recent`;

function createGameEndPayload(steamId: number, matchId: string) {
  return {
    matchId,
    version: 'v4.05',
    difficulty: 3,
    winnerTeamId: 2,
    gameTimeMsec: 1_800_000,
    gameOptions: {
      multiplierRadiant: 1,
      multiplierDire: 2,
      playerNumberRadiant: 1,
      playerNumberDire: 9,
      towerPowerPct: 120,
    },
    players: [
      {
        steamId,
        heroName: 'npc_dota_hero_medusa',
        teamId: 2,
        isDisconnected: false,
        level: 25,
        kills: 5,
        deaths: 3,
        assists: 2,
        lastHits: 50,
        totalGoldEarned: 10000,
        heroDamage: 5000,
        damageTaken: 1000,
        healing: 0,
        towerKills: 1,
        stuns: 12.5,
        roshanKills: 1,
        awaken: 1,
        score: 10,
        battlePoints: 100,
        strength: 40,
        agility: 25,
        intellect: 18,
        items: ['item_blink', '', '', '', '', ''],
        neutralItem: 'item_mind_breaker',
        neutralPassiveItem: '',
        abilities: ['skywrath_mage_mystic_flare', 'bristleback_bristleback', ''],
      },
      // 机器人这一行不该进战绩
      {
        steamId: 0,
        heroName: 'npc_dota_hero_axe',
        teamId: 3,
        isDisconnected: false,
        level: 20,
        kills: 1,
        deaths: 5,
        assists: 0,
        lastHits: 10,
        totalGoldEarned: 3000,
        heroDamage: 1000,
        damageTaken: 4000,
        healing: 0,
        towerKills: 0,
        score: 1,
        battlePoints: 0,
      },
    ],
  };
}

describe('PlayerStatsRecent (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await initTest();
  });

  afterAll(async () => {
    await app.close();
  });

  it('结算后网站能取到这一局，含游戏端新发的出装与技能', async () => {
    const steamId = 200001201;
    await createPlayer(app, { steamId });
    await post(app, gameEndUrl, createGameEndPayload(steamId, 'e2e-recent-1')).expect(201);
    const idToken = await createIdTokenForSteamId(steamId);

    const response = await request(app.getHttpServer())
      .get(recentUrl(steamId))
      .set('Authorization', `Bearer ${idToken}`)
      .expect(200);

    expect(response.body.matches).toHaveLength(1);
    expect(response.body.matches[0]).toMatchObject({
      matchId: 'e2e-recent-1',
      version: 'v4.05',
      difficulty: 3,
      durationSec: 1800,
      win: true,
      multiplierDire: 2,
      towerPowerPct: 120,
      heroName: 'npc_dota_hero_medusa',
      level: 25,
      awaken: 1,
      kills: 5,
      stuns: 12.5,
      roshanKills: 1,
      battlePoints: 100,
      strength: 40,
      agility: 25,
      intellect: 18,
      items: ['item_blink', '', '', '', '', ''],
      neutralItem: 'item_mind_breaker',
      abilities: ['skywrath_mage_mystic_flare', 'bristleback_bristleback', ''],
    });
    expect(typeof response.body.matches[0].endedAt).toBe('string');
  });

  it('新场次排在最前，limit 只截断返回条数', async () => {
    const steamId = 200001202;
    await createPlayer(app, { steamId });
    await post(app, gameEndUrl, createGameEndPayload(steamId, 'e2e-recent-old')).expect(201);
    await post(app, gameEndUrl, createGameEndPayload(steamId, 'e2e-recent-new')).expect(201);

    await post(app, gameEndUrl, createGameEndPayload(steamId, 'e2e-recent-newest')).expect(201);

    const all = await get(app, recentUrl(steamId)).expect(200);
    expect(all.body.matches.map((match: { matchId: string }) => match.matchId)).toEqual([
      'e2e-recent-newest',
      'e2e-recent-new',
      'e2e-recent-old',
    ]);

    const limited = await get(app, recentUrl(steamId), { limit: 1 }).expect(200);
    expect(limited.body.matches).toHaveLength(1);
    expect(limited.body.matches[0].matchId).toBe('e2e-recent-newest');
  });

  it('没打过的玩家返回空数组而不是 404', async () => {
    const steamId = 200001203;

    const response = await get(app, recentUrl(steamId)).expect(200);

    expect(response.body.matches).toEqual([]);
  });
});
