import { INestApplication } from '@nestjs/common';

import { initTest, put } from './util/util-http';
import { getPlayerSetting } from './util/util-player';

describe('PlayerSettingController (e2e)', () => {
  const playerUrl = '/api/player';
  let app: INestApplication;

  beforeAll(async () => {
    app = await initTest();
  });

  describe(`${playerUrl}/:id/setting (Put)`, () => {
    it('获取玩家设置 - 默认值', async () => {
      const testPlayer = 300400001;
      const playerSetting = await getPlayerSetting(app, testPlayer.toString());
      expect(playerSetting).toEqual({
        id: testPlayer.toString(),
        isRememberAbilityKey: false,
        activeAbilityKey: '',
        passiveAbilityKey: '',
        activeAbilityQuickCast: false,
        passiveAbilityQuickCast: false,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
    });

    it('更新玩家设置 - 设置快捷键', async () => {
      const testPlayer = 300400002;
      const updateData = {
        isRememberAbilityKey: true,
        activeAbilityKey: 'Q',
        passiveAbilityKey: 'E',
        activeAbilityQuickCast: true,
        passiveAbilityQuickCast: true,
      };

      const response = await put(app, `${playerUrl}/${testPlayer}/setting`, updateData);
      expect(response.status).toEqual(200);
      expect(response.body).toEqual(
        expect.objectContaining({
          id: testPlayer.toString(),
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

    it('更新玩家设置 - 默认不记住快捷键但保留快速施法', async () => {
      const testPlayer = 300400003;
      // 先设置快捷键和快速施法
      const response = await put(app, `${playerUrl}/${testPlayer}/setting`, {
        activeAbilityKey: 'Q',
        passiveAbilityKey: 'E',
        activeAbilityQuickCast: true,
        passiveAbilityQuickCast: false,
      });

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

    it('更新玩家设置 - 记忆快捷键后，再取消记忆快捷键但保留快速施法', async () => {
      const testPlayer = 300400004;
      // 先设置快捷键和快速施法
      await put(app, `${playerUrl}/${testPlayer}/setting`, {
        isRememberAbilityKey: true,
        activeAbilityKey: 'Q',
        passiveAbilityKey: 'E',
        activeAbilityQuickCast: true,
        passiveAbilityQuickCast: false,
      });

      // 设置不记住快捷键
      const updateData = {
        isRememberAbilityKey: false,
      };

      const response = await put(app, `${playerUrl}/${testPlayer}/setting`, updateData);
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
