import { INestApplication } from '@nestjs/common';

import { initTest, put } from './util/util-http';
import { createPlayer, getPlayerSetting } from './util/util-player';

describe('PlayerSettingController (e2e)', () => {
  const playerUrl = '/api/player';
  let app: INestApplication;

  beforeAll(async () => {
    app = await initTest();
  });

  describe(`${playerUrl}/:id/settings (Put)`, () => {
    const testPlayer = 300400001;

    beforeEach(async () => {
      // 创建测试玩家
      await createPlayer(app, {
        steamId: testPlayer,
      });
    });

    it('获取玩家设置 - 默认值', async () => {
      const playerSetting = await getPlayerSetting(app, testPlayer.toString());
      expect(playerSetting).toEqual({
        id: testPlayer.toString(),
        isRememberAbilityKey: true,
        activeAbilityKey: '',
        passiveAbilityKey: '',
        activeAbilityQuickCast: false,
        passiveAbilityQuickCast: false,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
    });

    it('更新玩家设置 - 设置快捷键', async () => {
      const updateData = {
        activeAbilityKey: 'Q',
        passiveAbilityKey: 'E',
        activeAbilityQuickCast: true,
        passiveAbilityQuickCast: true,
      };

      const response = await put(app, `${playerUrl}/${testPlayer}/settings`, updateData);
      expect(response.status).toEqual(200);
      expect(response.body).toEqual(
        expect.objectContaining({
          id: testPlayer.toString(),
          isRememberAbilityKey: true,
          ...updateData,
        }),
      );

      // 验证更新后的设置
      const playerSetting = await getPlayerSetting(app, testPlayer.toString());
      expect(playerSetting.id).toEqual(testPlayer.toString());
      expect(playerSetting.isRememberAbilityKey).toEqual(true);
      expect(playerSetting.activeAbilityKey).toEqual('Q');
      expect(playerSetting.passiveAbilityKey).toEqual('E');
      expect(playerSetting.activeAbilityQuickCast).toEqual(true);
      expect(playerSetting.passiveAbilityQuickCast).toEqual(true);
    });

    it('更新玩家设置 - 不记住快捷键但保留快速施法', async () => {
      // 先设置快捷键和快速施法
      await put(app, `${playerUrl}/${testPlayer}/settings`, {
        activeAbilityKey: 'Q',
        passiveAbilityKey: 'E',
        activeAbilityQuickCast: true,
        passiveAbilityQuickCast: false,
      });

      // 设置不记住快捷键
      const updateData = {
        isRememberAbilityKey: false,
      };

      const response = await put(app, `${playerUrl}/${testPlayer}/settings`, updateData);
      expect(response.status).toEqual(200);
      expect(response.body).toEqual(
        expect.objectContaining({
          id: testPlayer.toString(),
          isRememberAbilityKey: false,
          activeAbilityKey: '',
          passiveAbilityKey: '',
          activeAbilityQuickCast: true,
          passiveAbilityQuickCast: false,
        }),
      );

      // 验证更新后的设置
      const playerSetting = await getPlayerSetting(app, testPlayer.toString());
      expect(playerSetting.id).toEqual(testPlayer.toString());
      expect(playerSetting.isRememberAbilityKey).toEqual(false);
      expect(playerSetting.activeAbilityKey).toEqual('');
      expect(playerSetting.passiveAbilityKey).toEqual('');
      expect(playerSetting.activeAbilityQuickCast).toEqual(true);
      expect(playerSetting.passiveAbilityQuickCast).toEqual(false);
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
