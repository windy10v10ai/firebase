import { INestApplication } from '@nestjs/common';

import { initTest, put } from './util/util-http';
import { awakenHero, createPlayer } from './util/util-player';

describe('HeroAwakeningController (e2e)', () => {
  const playerUrl = '/api/player';
  let app: INestApplication;

  beforeAll(async () => {
    app = await initTest();
  });

  afterAll(async () => {
    await app.close();
  });

  describe(`${playerUrl}/:steamId/hero-awakening/random (Put)`, () => {
    it('首次调用：存入并返回 body 中的候选集', async () => {
      const testPlayer = 300500001;
      await createPlayer(app, { steamId: testPlayer, seasonPointTotal: 100000 });
      const candidates = ['npc_dota_hero_axe', 'npc_dota_hero_bane', 'npc_dota_hero_lina'];

      const response = await put(app, `${playerUrl}/${testPlayer}/hero-awakening/random`, {
        candidates,
      });

      expect(response.status).toEqual(200);
      expect(response.body).toEqual({ candidates });
    });

    it('已有未消费候选集时，原样返回旧值，忽略新 body', async () => {
      const testPlayer = 300500002;
      await createPlayer(app, { steamId: testPlayer, seasonPointTotal: 100000 });
      const firstCandidates = ['npc_dota_hero_axe', 'npc_dota_hero_bane', 'npc_dota_hero_lina'];
      const secondCandidates = ['npc_dota_hero_pudge', 'npc_dota_hero_sven', 'npc_dota_hero_tiny'];

      await put(app, `${playerUrl}/${testPlayer}/hero-awakening/random`, {
        candidates: firstCandidates,
      });
      const response = await put(app, `${playerUrl}/${testPlayer}/hero-awakening/random`, {
        candidates: secondCandidates,
      });

      expect(response.status).toEqual(200);
      expect(response.body).toEqual({ candidates: firstCandidates });
    });

    it('candidates 含无效英雄名应报错', async () => {
      const testPlayer = 300500003;
      await createPlayer(app, { steamId: testPlayer, seasonPointTotal: 100000 });

      const response = await put(app, `${playerUrl}/${testPlayer}/hero-awakening/random`, {
        candidates: ['npc_dota_hero_axe', 'npc_dota_hero_not_a_real_hero'],
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });
  });

  describe(`${playerUrl}/:steamId/hero-awakening (Put) - 重复认领`, () => {
    it('已觉醒英雄重复认领应 no-op 成功，不二次扣分', async () => {
      const testPlayer = 300500010;
      await createPlayer(app, { steamId: testPlayer, seasonPointTotal: 100000 });
      const heroName = 'npc_dota_hero_axe';

      const first = await awakenHero(app, testPlayer, heroName, false);
      expect(first.status).toEqual(200);
      const usedSeasonPointAfterFirst = first.body.usedSeasonPoint;

      const second = await awakenHero(app, testPlayer, heroName, false);

      expect(second.status).toEqual(200);
      expect(second.body.usedSeasonPoint).toEqual(usedSeasonPointAfterFirst);
      expect(
        second.body.awakenedHeroes.filter((h: { heroName: string }) => h.heroName === heroName),
      ).toHaveLength(1);
    });
  });
});
