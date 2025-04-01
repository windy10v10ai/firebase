import { INestApplication } from '@nestjs/common';
import { BaseFirestoreRepository } from 'fireorm';

import { Member, MemberLevel } from '../src/members/entities/members.entity';
import { Player } from '../src/player/entities/player.entity';

import { get, initTest, mockDate, post } from './util/util-http';

describe('MemberController (e2e)', () => {
  let app: INestApplication;
  let membersRepository: BaseFirestoreRepository<Member>;
  let playerRepository: BaseFirestoreRepository<Player>;

  const daysPerMonth = 31;

  beforeAll(async () => {
    app = await initTest();
    membersRepository = app.get('MemberRepository');
    playerRepository = app.get('PlayerRepository');
  });

  describe('members/ (GET)', () => {
    it('获取不存在的会员 return 404', async () => {
      const response = await get(app, '/api/members/987654321');
      expect(response.status).toEqual(404);
    });

    describe('获取存在已过期的会员', () => {
      it('已过期的普通会员', async () => {
        // 初始化测试数据
        await membersRepository.create({
          id: '20200801',
          steamId: 20200801,
          expireDate: new Date('2020-08-01T00:00:00Z'),
          level: MemberLevel.NORMAL,
        });

        const response = await get(app, '/api/members/20200801');
        expect(response.status).toEqual(200);
        expect(response.body).toEqual({
          steamId: 20200801,
          expireDateString: '2020-08-01',
          enable: false,
          level: MemberLevel.NORMAL,
        });
      });

      it('已过期的高级会员', async () => {
        // 初始化测试数据
        await membersRepository.create({
          id: '20200802',
          steamId: 20200802,
          expireDate: new Date('2020-08-02T00:00:00Z'),
          level: MemberLevel.NORMAL,
        });

        const response = await get(app, '/api/members/20200802');
        expect(response.status).toEqual(200);
        expect(response.body).toEqual({
          steamId: 20200802,
          expireDateString: '2020-08-02',
          enable: false,
          level: MemberLevel.NORMAL,
        });
      });
    });

    describe('获取存在且有效的会员', () => {
      it('有效的普通会员', async () => {
        // 初始化测试数据
        await membersRepository.create({
          id: '20300801',
          steamId: 20300801,
          expireDate: new Date('2030-08-01T00:00:00Z'),
          level: MemberLevel.NORMAL,
        });

        const response = await get(app, '/api/members/20300801');
        expect(response.status).toEqual(200);
        expect(response.body).toEqual({
          steamId: 20300801,
          expireDateString: '2030-08-01',
          enable: true,
          level: MemberLevel.NORMAL,
        });
      });

      it('有效的高级会员', async () => {
        // 初始化测试数据
        await membersRepository.create({
          id: '20300802',
          steamId: 20300802,
          expireDate: new Date('2030-08-02T00:00:00Z'),
          level: MemberLevel.PREMIUM,
        });

        const response = await get(app, '/api/members/20300802');
        expect(response.status).toEqual(200);
        expect(response.body).toEqual({
          steamId: 20300802,
          expireDateString: '2030-08-02',
          enable: true,
          level: MemberLevel.PREMIUM,
        });
      });
    });
  });

  describe('members/ (POST)', () => {
    it.each([
      [1, 300000001, MemberLevel.NORMAL],
      [2, 300000002, MemberLevel.NORMAL],
      [3, 300000003, MemberLevel.NORMAL],
      [6, 300000004, MemberLevel.NORMAL],
      [12, 300000005, MemberLevel.NORMAL],
      [36, 300000006, MemberLevel.NORMAL],
      [1, 300000011, MemberLevel.PREMIUM],
      [2, 300000012, MemberLevel.PREMIUM],
      [3, 300000013, MemberLevel.PREMIUM],
      [6, 300000014, MemberLevel.PREMIUM],
      [12, 300000015, MemberLevel.PREMIUM],
      [36, 300000016, MemberLevel.PREMIUM],
    ])('新开通 %s个月普通/高级会员 获得会员时长', async (month, steamId, level) => {
      const dateNextMonth = new Date();
      dateNextMonth.setUTCDate(new Date().getUTCDate() + month * daysPerMonth);
      const expectBodyJson = {
        steamId,
        expireDateString: dateNextMonth.toISOString().split('T')[0],
        enable: true,
        level,
      };

      const responseBefore = await get(app, `/api/members/${steamId}`);
      expect(responseBefore.status).toEqual(404);

      const responseCreate = await post(app, '/api/members', {
        steamId,
        month,
        level,
      });
      expect(responseCreate.status).toEqual(201);
      expect(responseCreate.body).toEqual(expectBodyJson);

      const responseAfter = await get(app, `/api/members/${steamId}`);
      expect(responseAfter.status).toEqual(200);
      expect(responseAfter.body).toEqual(expectBodyJson);
    });

    it.each([
      [1, 300000101, MemberLevel.NORMAL, MemberLevel.NORMAL],
      [3, 300000102, MemberLevel.NORMAL, MemberLevel.NORMAL],
      [12, 300000103, MemberLevel.NORMAL, MemberLevel.NORMAL],
      [1, 300000111, MemberLevel.PREMIUM, MemberLevel.PREMIUM],
      [3, 300000112, MemberLevel.PREMIUM, MemberLevel.PREMIUM],
      [12, 300000113, MemberLevel.PREMIUM, MemberLevel.PREMIUM],
      [1, 300000121, MemberLevel.NORMAL, MemberLevel.PREMIUM],
      [3, 300000122, MemberLevel.NORMAL, MemberLevel.PREMIUM],
      [12, 300000123, MemberLevel.NORMAL, MemberLevel.PREMIUM],
      [1, 300000131, MemberLevel.PREMIUM, MemberLevel.NORMAL],
      [3, 300000132, MemberLevel.PREMIUM, MemberLevel.NORMAL],
      [12, 300000133, MemberLevel.PREMIUM, MemberLevel.NORMAL],
    ])(
      '会员已过期 开通%s个月普通/高级会员 获得会员时长',
      async (month, steamId, passedLevel, expectLevel) => {
        // 初始化测试数据
        await membersRepository.create({
          id: steamId.toString(),
          steamId,
          expireDate: new Date('2020-12-31T00:00:00Z'),
          level: passedLevel,
        });

        const dateNextMonth = new Date();
        dateNextMonth.setUTCDate(new Date().getUTCDate() + month * daysPerMonth);
        const expectBodyJson = {
          steamId,
          expireDateString: dateNextMonth.toISOString().split('T')[0],
          enable: true,
          level: expectLevel,
        };

        const responseBefore = await get(app, `/api/members/${steamId}`);
        expect(responseBefore.status).toEqual(200);

        const responseCreate = await post(app, '/api/members', {
          steamId,
          month,
          level: expectLevel,
        });
        expect(responseCreate.status).toEqual(201);
        expect(responseCreate.body).toEqual(expectBodyJson);

        const responseAfter = await get(app, `/api/members/${steamId}`);
        expect(responseAfter.status).toEqual(200);
        expect(responseAfter.body).toEqual(expectBodyJson);
      },
    );

    it.each([
      [1, 300000201, '2041-01-31', MemberLevel.NORMAL],
      [2, 300000202, '2041-03-03', MemberLevel.NORMAL],
      [3, 300000203, '2041-04-03', MemberLevel.NORMAL],
      [6, 300000204, '2041-07-05', MemberLevel.NORMAL],
      [12, 300000205, '2042-01-07', MemberLevel.NORMAL],
      [1, 300000211, '2041-01-31', MemberLevel.PREMIUM],
      [2, 300000212, '2041-03-03', MemberLevel.PREMIUM],
      [3, 300000213, '2041-04-03', MemberLevel.PREMIUM],
      [6, 300000214, '2041-07-05', MemberLevel.PREMIUM],
      [12, 300000215, '2042-01-07', MemberLevel.PREMIUM],
    ])(
      '普通/高级会员有效 开通%s个月相同类比会员 以有效期为起点增加相应会员时长',
      async (month, steamId, expireDateString, expectLevel) => {
        // 初始化测试数据
        await membersRepository.create({
          id: steamId.toString(),
          steamId,
          expireDate: new Date('2040-12-31T00:00:00Z'),
          level: expectLevel,
        });

        const expectBodyJson = {
          steamId,
          expireDateString,
          enable: true,
          level: expectLevel,
        };

        const responseBefore = await get(app, `/api/members/${steamId}`);
        expect(responseBefore.status).toEqual(200);

        const responseCreate = await post(app, '/api/members', {
          steamId,
          month,
          level: expectLevel,
        });
        expect(responseCreate.status).toEqual(201);
        expect(responseCreate.body).toEqual(expectBodyJson);

        const responseAfter = await get(app, `/api/members/${steamId}`);
        expect(responseAfter.status).toEqual(200);
        expect(responseAfter.body).toEqual(expectBodyJson);
      },
    );

    it.each([
      [1, 300000301, '2041-01-19'],
      [2, 300000302, '2041-02-07'],
      [3, 300000303, '2041-02-25'],
      [6, 300000304, '2041-04-22'],
      [12, 300000305, '2041-08-12'],
    ])(
      '高级会员有效 开通%s个月普通会员 按照0.6的比例增加高级会员时长',
      async (month, steamId, expireDateString) => {
        // 初始化测试数据
        await membersRepository.create({
          id: steamId.toString(),
          steamId,
          expireDate: new Date('2040-12-31T00:00:00Z'),
          level: MemberLevel.PREMIUM,
        });

        const expectBodyJson = {
          steamId,
          expireDateString,
          enable: true,
          level: MemberLevel.PREMIUM,
        };

        const responseBefore = await get(app, `/api/members/${steamId}`);
        expect(responseBefore.status).toEqual(200);

        const responseCreate = await post(app, '/api/members', {
          steamId,
          month,
          level: MemberLevel.NORMAL,
        });
        expect(responseCreate.status).toEqual(201);
        expect(responseCreate.body).toEqual(expectBodyJson);

        const responseAfter = await get(app, `/api/members/${steamId}`);
        expect(responseAfter.status).toEqual(200);
        expect(responseAfter.body).toEqual(expectBodyJson);
      },
    );

    it.each([
      [1, 300000401, '2025-04-02T00:00:00.000Z', '2025-05-03'],
      [1, 300000402, '2025-04-03T00:00:00.000Z', '2025-05-04'],
      [1, 300000403, '2025-04-04T00:00:00.000Z', '2025-05-04'],
      [1, 300000404, '2025-04-05T00:00:00.000Z', '2025-05-05'],
      [1, 300000405, '2025-04-06T00:00:00.000Z', '2025-05-05'],
      [1, 300000406, '2025-05-01T00:00:00.000Z', '2025-05-20'],
      [1, 300000407, '2028-01-01T00:00:00.000Z', '2026-12-26'],
      [1, 300000408, '2040-01-01T00:00:00.000Z', '2034-03-09'],
      [1, 300000409, '2099-01-01T00:00:00.000Z', '2069-08-02'],
      [1, 300000410, '2100-01-01T00:00:00.000Z', '2070-03-09'],
      [3, 300000411, '2025-05-01T00:00:00.000Z', '2025-07-21'],
      [6, 300000412, '2025-05-01T00:00:00.000Z', '2025-10-22'],
      [12, 300000413, '2025-05-01T00:00:00.000Z', '2026-04-26'],
      [36, 300000414, '2025-05-01T00:00:00.000Z', '2028-05-09'],
    ])(
      '普通会员有效 开通%s个月高级会员 剩余普通会员天数按照0.6的比例换算成高级会员后 再追加高级会员时长',
      async (month, steamId, passedExpireDate, expireDateString) => {
        // 设置当前日期
        mockDate('2025-04-01T00:00:00.000Z');
        // 初始化测试数据
        await membersRepository.create({
          id: steamId.toString(),
          steamId,
          expireDate: new Date(passedExpireDate),
          level: MemberLevel.NORMAL,
        });

        const expectBodyJson = {
          steamId,
          expireDateString,
          enable: true,
          level: MemberLevel.PREMIUM,
        };

        const responseBefore = await get(app, `/api/members/${steamId}`);
        expect(responseBefore.status).toEqual(200);

        const responseCreate = await post(app, '/api/members', {
          steamId,
          month,
          level: MemberLevel.PREMIUM,
        });
        expect(responseCreate.status).toEqual(201);
        expect(responseCreate.body).toEqual(expectBodyJson);

        const responseAfter = await get(app, `/api/members/${steamId}`);
        expect(responseAfter.status).toEqual(200);
        expect(responseAfter.body).toEqual(expectBodyJson);
      },
    );
  });

  afterAll(async () => {
    await app.close();
  });
});
