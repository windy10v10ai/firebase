import { INestApplication } from '@nestjs/common';

import { initTest, put } from './util/util-http';

const playerUrl = '/api/player';

describe('PlayerGamePresetController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await initTest();
  });

  afterAll(async () => {
    await app.close();
  });

  describe(`${playerUrl}/:id/game-preset (Put)`, () => {
    it('保存 dota 难度 - 返回 PlayerSetting 含 gamePresetDota', async () => {
      const steamId = 300500001;
      const res = await put(app, `${playerUrl}/${steamId}/game-preset`, {
        map: 'dota',
        remember: true,
        difficulty: 3,
      });
      expect(res.status).toEqual(200);
      expect(res.body.gamePresetDota).toEqual({ difficulty: 3 });
      expect(res.body.gamePresetHard).toBeUndefined();
      expect(res.body.gamePresetCustom).toBeUndefined();
    });

    it('保存 hard 难度 - 返回 PlayerSetting 含 gamePresetHard', async () => {
      const steamId = 300500002;
      const res = await put(app, `${playerUrl}/${steamId}/game-preset`, {
        map: 'hard',
        remember: true,
        difficulty: 7,
      });
      expect(res.status).toEqual(200);
      expect(res.body.gamePresetHard).toEqual({ difficulty: 7 });
    });

    it('保存 custom 整套 KV - 返回 PlayerSetting 含 gamePresetCustom', async () => {
      const steamId = 300500003;
      const gameOptions = {
        multiplierRadiant: 1,
        multiplierDire: 2,
        playerNumberRadiant: 5,
        playerNumberDire: 5,
        towerPowerPct: 100,
        respawnTimePct: 100,
        startingGoldPlayer: 600,
        startingGoldBot: 600,
        maxLevel: 30,
        fixedAbility: '',
        forceRandomHero: 0,
        enablePlayerAttribute: 1,
        midOnlyMode: 0,
      };
      const res = await put(app, `${playerUrl}/${steamId}/game-preset`, {
        map: 'custom',
        remember: true,
        gameOptions,
      });
      expect(res.status).toEqual(200);
      expect(res.body.gamePresetCustom).toEqual({ gameOptions });
    });

    it('保存多张图后各槽位独立保留', async () => {
      const steamId = 300500004;
      await put(app, `${playerUrl}/${steamId}/game-preset`, {
        map: 'dota',
        remember: true,
        difficulty: 2,
      });
      const res = await put(app, `${playerUrl}/${steamId}/game-preset`, {
        map: 'hard',
        remember: true,
        difficulty: 7,
      });
      expect(res.status).toEqual(200);
      // dota 槽位保留
      expect(res.body.gamePresetDota).toEqual({ difficulty: 2 });
      // hard 槽位写入
      expect(res.body.gamePresetHard).toEqual({ difficulty: 7 });
    });

    it('remember: false 应清除对应 flat 字段，其余槽位不受影响', async () => {
      const steamId = 300500005;
      await put(app, `${playerUrl}/${steamId}/game-preset`, {
        map: 'dota',
        remember: true,
        difficulty: 3,
      });
      await put(app, `${playerUrl}/${steamId}/game-preset`, {
        map: 'hard',
        remember: true,
        difficulty: 6,
      });

      const res = await put(app, `${playerUrl}/${steamId}/game-preset`, {
        map: 'dota',
        remember: false,
      });
      expect(res.status).toEqual(200);
      // dota 槽位应被清除
      expect(res.body.gamePresetDota).toBeUndefined();
      // hard 槽位应保留
      expect(res.body.gamePresetHard).toEqual({ difficulty: 6 });
    });
  });
});
