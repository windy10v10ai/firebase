import { INestApplication } from '@nestjs/common';
import { BaseFirestoreRepository } from 'fireorm';

import { Member, MemberLevel } from '../src/members/entities/members.entity';

import { get, initTest, post } from './util/util-http';

describe('MemberController (e2e)', () => {
  let app: INestApplication;
  let membersRepository: BaseFirestoreRepository<Member>;
  const daysPerMonth = 31;
  beforeAll(async () => {
    app = await initTest();
    membersRepository = app.get('MemberRepository');
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
    it('开通一个月会员 新建 检测会员数据储存是否一致', async () => {
      const dateNextMonth = new Date();
      dateNextMonth.setUTCDate(new Date().getUTCDate() + daysPerMonth);
      const expectBodyJson = {
        steamId: 123456789,
        expireDateString: dateNextMonth.toISOString().split('T')[0],
        enable: true,
        level: MemberLevel.NORMAL,
      };

      const responseBefore = await get(app, '/api/members/123456789');
      expect(responseBefore.status).toEqual(404);

      const responseCreate = await post(app, '/api/members', {
        steamId: 123456789,
        month: 1,
        level: MemberLevel.NORMAL,
      });
      expect(responseCreate.status).toEqual(201);
      expect(responseCreate.body).toEqual(expectBodyJson);

      const responseAfter = await get(app, '/api/members/123456789');
      expect(responseAfter.status).toEqual(200);
      expect(responseAfter.body).toEqual(expectBodyJson);
    });

    it('开通一个月会员 有效期过去 检测会员数据储存是否一致', async () => {
      // 初始化测试数据
      await membersRepository.create({
        id: '20201231',
        steamId: 20201231,
        expireDate: new Date('2020-12-31T00:00:00Z'),
        level: MemberLevel.NORMAL,
      });

      const dateNextMonth = new Date();
      dateNextMonth.setUTCDate(new Date().getUTCDate() + daysPerMonth);
      const expectBodyJson = {
        steamId: 20201231,
        expireDateString: dateNextMonth.toISOString().split('T')[0],
        enable: true,
        level: MemberLevel.NORMAL,
      };

      const responseBefore = await get(app, '/api/members/20201231');
      expect(responseBefore.status).toEqual(200);

      const responseCreate = await post(app, '/api/members', {
        steamId: 20201231,
        month: 1,
        level: MemberLevel.NORMAL,
      });
      expect(responseCreate.status).toEqual(201);
      expect(responseCreate.body).toEqual(expectBodyJson);

      const responseAfter = await get(app, '/api/members/20201231');
      expect(responseAfter.status).toEqual(200);
      expect(responseAfter.body).toEqual(expectBodyJson);
    });

    it('开通一个月会员 有效期在未来 检测会员数据储存是否一致', async () => {
      // 初始化测试数据
      await membersRepository.create({
        id: '20301231',
        steamId: 20301231,
        expireDate: new Date('2030-12-31T00:00:00Z'),
        level: MemberLevel.NORMAL,
      });

      const expectBodyJson = {
        steamId: 20301231,
        expireDateString: '2031-01-31',
        enable: true,
        level: MemberLevel.NORMAL,
      };

      const responseBefore = await get(app, '/api/members/20301231');
      expect(responseBefore.status).toEqual(200);

      const responseCreate = await post(app, '/api/members', {
        steamId: 20301231,
        month: 1,
        level: MemberLevel.NORMAL,
      });
      expect(responseCreate.status).toEqual(201);
      expect(responseCreate.body).toEqual(expectBodyJson);

      const responseAfter = await get(app, '/api/members/20301231');
      expect(responseAfter.status).toEqual(200);
      expect(responseAfter.body).toEqual(expectBodyJson);
    });

    it('开通复数月会员 新建', async () => {
      const dateNextMonth = new Date();
      dateNextMonth.setUTCDate(new Date().getUTCDate() + daysPerMonth * 13);
      const expectBodyJson = {
        steamId: 1234567890,
        expireDateString: dateNextMonth.toISOString().split('T')[0],
        enable: true,
        level: MemberLevel.NORMAL,
      };

      const responseCreate = await post(app, '/api/members', {
        steamId: 1234567890,
        month: 13,
        level: MemberLevel.NORMAL,
      });
      expect(responseCreate.status).toEqual(201);
      expect(responseCreate.body).toEqual(expectBodyJson);
    });

    it('开通复数月会员 有效期在过去', async () => {
      // 初始化测试数据
      await membersRepository.create({
        id: '20200901',
        steamId: 20200901,
        expireDate: new Date('2020-09-01T00:00:00Z'),
        level: MemberLevel.NORMAL,
      });

      const dateNextMonth = new Date();
      dateNextMonth.setUTCDate(new Date().getUTCDate() + daysPerMonth * 3);

      const responseCreate = await post(app, '/api/members', {
        steamId: 20200901,
        month: 3,
        level: MemberLevel.NORMAL,
      });
      expect(responseCreate.status).toEqual(201);
      expect(responseCreate.body).toEqual({
        steamId: 20200901,
        expireDateString: dateNextMonth.toISOString().split('T')[0],
        enable: true,
        level: MemberLevel.NORMAL,
      });
    });

    it('开通复数月会员 有效期在未来', async () => {
      // 初始化测试数据
      await membersRepository.create({
        id: '20301001',
        steamId: 20301001,
        expireDate: new Date('2030-10-01T00:00:00Z'),
        level: MemberLevel.NORMAL,
      });

      const responseCreate = await post(app, '/api/members', {
        steamId: 20301001,
        month: 12,
        level: MemberLevel.NORMAL,
      });
      expect(responseCreate.status).toEqual(201);
      expect(responseCreate.body).toEqual({
        steamId: 20301001,
        expireDateString: '2031-10-08',
        enable: true,
        level: MemberLevel.NORMAL,
      });
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
