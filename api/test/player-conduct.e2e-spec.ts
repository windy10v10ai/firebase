import { INestApplication } from '@nestjs/common';

import { ConductType } from '../src/player/dto/conduct-player.dto';

import { initTest, mockDate, post, restoreDate } from './util/util-http';
import { createPlayer, getPlayer } from './util/util-player';

const conductUrl = '/api/player/conduct';

function conduct(app: INestApplication, fromSteamId: number, toSteamId: number, type: ConductType) {
  return post(app, conductUrl, { fromSteamId, toSteamId, type });
}

describe('PlayerConduct (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await initTest();
  });

  afterEach(() => {
    restoreDate();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    [ConductType.Commend, 200000001, 200000002, 102, 1, 0],
    [ConductType.Report, 200000011, 200000012, 98, 0, 1],
  ])(
    '首次 %s：counter +1 conductPoint 变化',
    async (type, from, to, expectedPoint, expectedCommend, expectedReport) => {
      mockDate('2026-05-01T00:00:00.000Z');
      await createPlayer(app, { steamId: to, conductPoint: 100 });

      const result = await conduct(app, from, to, type);
      expect(result.status).toEqual(201);
      expect(result.body.id).toEqual(to.toString());
      expect(result.body.commendCount).toEqual(expectedCommend);
      expect(result.body.reportCount).toEqual(expectedReport);
      expect(result.body.conductPoint).toEqual(expectedPoint);
    },
  );

  it('7 天内重复相同类型：数据不变', async () => {
    mockDate('2026-05-01T00:00:00.000Z');
    const from = 200000021;
    const to = 200000022;
    await createPlayer(app, { steamId: to, conductPoint: 100 });

    await conduct(app, from, to, ConductType.Commend);
    mockDate('2026-05-03T00:00:00.000Z'); // 2 天后
    const result = await conduct(app, from, to, ConductType.Commend);
    expect(result.status).toEqual(201);
    expect(result.body.commendCount).toEqual(1);
    expect(result.body.conductPoint).toEqual(102);
  });

  it('7 天内改变类型 commend→report：撤销旧的再加新的', async () => {
    mockDate('2026-05-01T00:00:00.000Z');
    const from = 200000031;
    const to = 200000032;
    await createPlayer(app, { steamId: to, conductPoint: 100 });

    // commend: 100 -> 102
    await conduct(app, from, to, ConductType.Commend);
    mockDate('2026-05-03T00:00:00.000Z');
    // 改类型：撤销 commend (102 -> 100) + report (100 -> 98)
    const result = await conduct(app, from, to, ConductType.Report);
    expect(result.status).toEqual(201);
    expect(result.body.commendCount).toEqual(0);
    expect(result.body.reportCount).toEqual(1);
    expect(result.body.conductPoint).toEqual(98);
  });

  it('7 天后再次同向：累加，不撤销', async () => {
    mockDate('2026-05-01T00:00:00.000Z');
    const from = 200000061;
    const to = 200000062;
    await createPlayer(app, { steamId: to, conductPoint: 100 });

    await conduct(app, from, to, ConductType.Commend);
    mockDate('2026-05-09T00:00:00.000Z'); // 8 天后
    const result = await conduct(app, from, to, ConductType.Commend);
    expect(result.status).toEqual(201);
    expect(result.body.commendCount).toEqual(2);
    expect(result.body.conductPoint).toEqual(104);
  });

  it('自评 → 400', async () => {
    mockDate('2026-05-01T00:00:00.000Z');
    const id = 200000041;
    await createPlayer(app, { steamId: id });
    const result = await conduct(app, id, id, ConductType.Commend);
    expect(result.status).toEqual(400);
  });

  it('target 不存在 → 404', async () => {
    mockDate('2026-05-01T00:00:00.000Z');
    const result = await conduct(app, 200000051, 200000052, ConductType.Commend);
    expect(result.status).toEqual(404);
  });

  it.each([
    ['上限 120', ConductType.Commend, 200000071, 200000072, 119, 120],
    ['下限 0', ConductType.Report, 200000081, 200000082, 1, 0],
  ])('conductPoint clamp 到%s', async (_label, type, from, to, initial, expectedPoint) => {
    mockDate('2026-05-01T00:00:00.000Z');
    await createPlayer(app, { steamId: to, conductPoint: initial });
    const result = await conduct(app, from, to, type);
    expect(result.status).toEqual(201);
    expect(result.body.conductPoint).toEqual(expectedPoint);
  });

  it('数据库写入：再次获取玩家数据一致', async () => {
    mockDate('2026-05-01T00:00:00.000Z');
    const from = 200000091;
    const to = 200000092;
    await createPlayer(app, { steamId: to, conductPoint: 100 });
    await conduct(app, from, to, ConductType.Commend);

    const player = await getPlayer(app, to);
    expect(player.conductPoint).toEqual(102);
    expect(player.commendCount).toEqual(1);
    expect(player.reportCount).toEqual(0);
  });
});
