import { INestApplication } from '@nestjs/common';
import { BaseFirestoreRepository } from 'fireorm';
import { getRepositoryToken } from 'nestjs-fireorm';

import { PlayerHeroAwakening } from '../src/player-hero-awakening/entities/player-hero-awakening.entity';

import { initTest, post } from './util/util-http';
import { createPlayer, getPlayer } from './util/util-player';

describe('AdminController - hero-awakening/season-point-price-adjustment (e2e)', () => {
  const adjustmentUrl = '/api/admin/hero-awakening/season-point-price-adjustment';
  let app: INestApplication;
  let playerHeroAwakeningRepository: BaseFirestoreRepository<PlayerHeroAwakening>;

  beforeAll(async () => {
    app = await initTest();
    playerHeroAwakeningRepository = app.get<BaseFirestoreRepository<PlayerHeroAwakening>>(
      getRepositoryToken(PlayerHeroAwakening),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('返还普通和随机觉醒的赛季积分差额，保留觉醒状态且可重复执行', async () => {
    const steamId = 300700001;
    await createPlayer(app, {
      steamId,
      seasonPointTotal: 20000,
      usedSeasonPoint: 15000,
    });
    await playerHeroAwakeningRepository.create({
      id: steamId.toString(),
      steamId,
      awakenings: [
        { heroName: 'npc_dota_hero_axe', usedSeasonPoint: 10000 },
        { heroName: 'npc_dota_hero_bane', usedSeasonPoint: 5000 },
      ],
    });

    const first = await post(app, adjustmentUrl, {});

    expect(first.status).toEqual(201);
    expect(first.body).toEqual({
      processedCount: expect.any(Number),
      totalRefundSeasonPoint: expect.any(Number),
    });
    expect(first.body.processedCount).toBeGreaterThanOrEqual(1);
    expect(first.body.totalRefundSeasonPoint).toBeGreaterThanOrEqual(3000);

    const playerAfterFirst = await getPlayer(app, steamId);
    expect(playerAfterFirst.usedSeasonPoint).toEqual(12000);
    const awakeningAfterFirst = await playerHeroAwakeningRepository.findById(steamId.toString());
    expect(awakeningAfterFirst?.awakenings).toEqual([
      { heroName: 'npc_dota_hero_axe', usedSeasonPoint: 8000 },
      { heroName: 'npc_dota_hero_bane', usedSeasonPoint: 4000 },
    ]);

    const second = await post(app, adjustmentUrl, {});

    expect(second.status).toEqual(201);
    const playerAfterSecond = await getPlayer(app, steamId);
    expect(playerAfterSecond.usedSeasonPoint).toEqual(12000);
  });
});
