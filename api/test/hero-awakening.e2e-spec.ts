import { INestApplication } from '@nestjs/common';

import { initTest, put } from './util/util-http';
import { awakenHero, createPlayer, ensureRandomHeroAwakeningCandidates } from './util/util-player';

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

    it('candidates 含已被该玩家觉醒的英雄应报错', async () => {
      const testPlayer = 300500004;
      await createPlayer(app, { steamId: testPlayer, seasonPointTotal: 100000 });
      await awakenHero(app, testPlayer, 'npc_dota_hero_axe', false);

      const response = await put(app, `${playerUrl}/${testPlayer}/hero-awakening/random`, {
        candidates: ['npc_dota_hero_axe', 'npc_dota_hero_bane', 'npc_dota_hero_lina'],
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

  describe(`${playerUrl}/:steamId/hero-awakening (Put) - 随机候选集半价认领`, () => {
    it('命中候选集：扣赛季半价 5000，候选集被清空', async () => {
      const testPlayer = 300500020;
      await createPlayer(app, { steamId: testPlayer, seasonPointTotal: 100000 });
      const candidates = ['npc_dota_hero_axe', 'npc_dota_hero_bane', 'npc_dota_hero_lina'];
      await ensureRandomHeroAwakeningCandidates(app, testPlayer, candidates);

      const response = await awakenHero(app, testPlayer, 'npc_dota_hero_axe', false);

      expect(response.status).toEqual(200);
      expect(response.body.usedSeasonPoint).toEqual(5000);
      expect(response.body.awakenedHeroes).toEqual(
        expect.arrayContaining([{ heroName: 'npc_dota_hero_axe' }]),
      );

      // 候选集已清空：再次 ensure 应当存入全新候选集，而不是返回旧的
      const newCandidates = ['npc_dota_hero_pudge', 'npc_dota_hero_sven', 'npc_dota_hero_tiny'];
      const ensureResponse = await ensureRandomHeroAwakeningCandidates(
        app,
        testPlayer,
        newCandidates,
      );
      expect(ensureResponse.body).toEqual({ candidates: newCandidates });
    });

    it('未命中候选集：维持全价 10000，候选集不受影响', async () => {
      const testPlayer = 300500021;
      await createPlayer(app, { steamId: testPlayer, seasonPointTotal: 100000 });
      const candidates = ['npc_dota_hero_bane', 'npc_dota_hero_lina', 'npc_dota_hero_pudge'];
      await ensureRandomHeroAwakeningCandidates(app, testPlayer, candidates);

      const response = await awakenHero(app, testPlayer, 'npc_dota_hero_axe', false);

      expect(response.status).toEqual(200);
      expect(response.body.usedSeasonPoint).toEqual(10000);

      // 候选集仍未消费：再次 ensure 应原样返回旧候选集
      const ensureResponse = await ensureRandomHeroAwakeningCandidates(app, testPlayer, [
        'npc_dota_hero_sven',
      ]);
      expect(ensureResponse.body).toEqual({ candidates });
    });

    it('候选英雄已被并发重复认领：第二次 no-op 成功、不二次扣分', async () => {
      const testPlayer = 300500022;
      await createPlayer(app, { steamId: testPlayer, seasonPointTotal: 100000 });
      const candidates = ['npc_dota_hero_axe', 'npc_dota_hero_bane', 'npc_dota_hero_lina'];
      await ensureRandomHeroAwakeningCandidates(app, testPlayer, candidates);

      // 第一次命中候选集，半价认领并清空候选集
      const first = await awakenHero(app, testPlayer, 'npc_dota_hero_axe', false);
      expect(first.status).toEqual(200);
      expect(first.body.usedSeasonPoint).toEqual(5000);

      // 并发场景下第二次认领同一英雄应 no-op 成功，不二次扣分
      const response = await awakenHero(app, testPlayer, 'npc_dota_hero_axe', false);

      expect(response.status).toEqual(200);
      expect(response.body.usedSeasonPoint).toEqual(5000);
      expect(
        response.body.awakenedHeroes.filter(
          (h: { heroName: string }) => h.heroName === 'npc_dota_hero_axe',
        ),
      ).toHaveLength(1);

      // 候选集已被第一次认领清空：再次 ensure 应存入全新候选集
      const newCandidates = ['npc_dota_hero_sven'];
      const ensureResponse = await ensureRandomHeroAwakeningCandidates(
        app,
        testPlayer,
        newCandidates,
      );
      expect(ensureResponse.body).toEqual({ candidates: newCandidates });
    });

    it('会员积分命中候选集：扣半价 2500', async () => {
      const testPlayer = 300500023;
      await createPlayer(app, { steamId: testPlayer, memberPointTotal: 100000 });
      const candidates = ['npc_dota_hero_axe', 'npc_dota_hero_bane', 'npc_dota_hero_lina'];
      await ensureRandomHeroAwakeningCandidates(app, testPlayer, candidates);

      const response = await awakenHero(app, testPlayer, 'npc_dota_hero_axe', true);

      expect(response.status).toEqual(200);
      expect(response.body.usedMemberPoint).toEqual(2500);
    });

    it('余额不足返回 4xx', async () => {
      const testPlayer = 300500024;
      await createPlayer(app, { steamId: testPlayer, seasonPointTotal: 1000 });
      const candidates = ['npc_dota_hero_axe', 'npc_dota_hero_bane', 'npc_dota_hero_lina'];
      await ensureRandomHeroAwakeningCandidates(app, testPlayer, candidates);

      const response = await awakenHero(app, testPlayer, 'npc_dota_hero_axe', false);

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });
  });
});
