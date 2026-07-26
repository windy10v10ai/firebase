import { INestApplication } from '@nestjs/common';
import { BaseFirestoreRepository } from 'fireorm';
import { getRepositoryToken } from 'nestjs-fireorm';

import { PlayerProperty } from '../src/player-property/entities/player-property.entity';

import { initTest, post } from './util/util-http';
import { addPlayerProperty, createPlayer, getPlayer } from './util/util-player';

describe('AdminController - player-property/reset (e2e)', () => {
  const resetUrl = '/api/admin/player-property/reset';
  let app: INestApplication;
  let playerPropertyRepository: BaseFirestoreRepository<PlayerProperty>;

  beforeAll(async () => {
    app = await initTest();
    playerPropertyRepository = app.get<BaseFirestoreRepository<PlayerProperty>>(
      getRepositoryToken(PlayerProperty),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('复现并修复：绕过 service 直接删除 PlayerProperty 文档后，usedLevel 未被重置', async () => {
    const testPlayer = 300600001;
    await createPlayer(app, { steamId: testPlayer, seasonPointTotal: 100000 });
    await addPlayerProperty(app, testPlayer, 'property_cooldown_percentage', 3);

    const beforeBypassDelete = await getPlayer(app, testPlayer);
    expect(beforeBypassDelete.usedLevel).toEqual(3);

    // 模拟绕过 service 直接删除 PlayerProperty 文档（复现本次线上问题：usedLevel 未被重置）
    await playerPropertyRepository.delete(testPlayer.toString());

    const afterBypassDelete = await getPlayer(app, testPlayer);
    expect(afterBypassDelete.usedLevel).toEqual(3);

    const response = await post(app, resetUrl, {});

    expect(response.status).toEqual(201);
    expect(response.body).toEqual({ processedCount: expect.any(Number) });
    expect(response.body.processedCount).toBeGreaterThanOrEqual(1);

    const afterFix = await getPlayer(app, testPlayer);
    expect(afterFix.usedLevel).toEqual(0);
  });

  it('未受影响玩家（usedLevel 本就为 0）不受端点影响', async () => {
    const testPlayer = 300600002;
    await createPlayer(app, { steamId: testPlayer, seasonPointTotal: 100000 });

    const before = await getPlayer(app, testPlayer);
    expect(before.usedLevel).toEqual(0);

    const response = await post(app, resetUrl, {});
    expect(response.status).toEqual(201);

    const after = await getPlayer(app, testPlayer);
    expect(after.usedLevel).toEqual(0);
  });

  it('端点幂等：连续执行两次结果一致', async () => {
    const testPlayer = 300600003;
    await createPlayer(app, { steamId: testPlayer, seasonPointTotal: 100000 });
    await addPlayerProperty(app, testPlayer, 'property_cooldown_percentage', 2);
    await playerPropertyRepository.delete(testPlayer.toString());

    const first = await post(app, resetUrl, {});
    expect(first.status).toEqual(201);
    const afterFirst = await getPlayer(app, testPlayer);
    expect(afterFirst.usedLevel).toEqual(0);

    const second = await post(app, resetUrl, {});
    expect(second.status).toEqual(201);
    const afterSecond = await getPlayer(app, testPlayer);
    expect(afterSecond.usedLevel).toEqual(0);
  });
});
