import { INestApplication } from '@nestjs/common';
import { BaseFirestoreRepository } from 'fireorm';

import { Member, MemberLevel } from '../src/members/entities/members.entity';

import { get, initTest, mockDate, post, restoreDate } from './util/util-http';

const gameStartUrl = '/api/game/start/';
const memberPostUrl = '/api/members/';
const matchId = 1;

function callGameStart(app: INestApplication, steamIds: number[]) {
  return get(app, gameStartUrl, { steamIds, matchId });
}

describe('会员签到补签 (e2e)', () => {
  let app: INestApplication;
  let membersRepository: BaseFirestoreRepository<Member>;

  beforeAll(async () => {
    app = await initTest();
    membersRepository = app.get('MemberRepository');
  });

  afterEach(() => {
    restoreDate();
  });

  afterAll(async () => {
    await app.close();
  });

  it('连续每天登录：每天只有"当日"一条 pointInfo，没有补签条目', async () => {
    const steamId = 400000001;
    mockDate('2026-08-01T00:00:00.000Z');
    await post(app, memberPostUrl, { steamId, month: 1, level: MemberLevel.NORMAL });
    // 购买当天登录，建立 lastDailyDate，避免购买当天本身被算作漏签
    await callGameStart(app, [steamId]);

    mockDate('2026-08-02T00:00:00.000Z');
    const result = await callGameStart(app, [steamId]);
    expect(result.status).toEqual(200);
    const memberPointInfos = result.body.pointInfo.filter((p) => p.steamId === steamId);
    expect(memberPointInfos).toEqual([
      {
        steamId,
        title: { cn: '获得会员经验', en: 'Get Member Experience' },
        memberPoint: 100,
      },
    ]);
  });

  it('漏签 3 天（一直是会员，未断档）：登录时补签 3 天，并把 lastDailyDate 推进到登录当天', async () => {
    const steamId = 400000002;
    mockDate('2026-08-01T00:00:00.000Z');
    await post(app, memberPostUrl, { steamId, month: 1, level: MemberLevel.NORMAL });

    // 连续签到一天，建立 lastDailyDate
    const result1 = await callGameStart(app, [steamId]);
    expect(result1.status).toEqual(200);

    // 漏签 3 天后才再次登录（8/2, 8/3, 8/4 没有上线，8/5 登录）
    mockDate('2026-08-05T00:00:00.000Z');
    const result2 = await callGameStart(app, [steamId]);
    expect(result2.status).toEqual(200);
    const memberPointInfos = result2.body.pointInfo.filter((p) => p.steamId === steamId);
    expect(memberPointInfos).toEqual(
      expect.arrayContaining([
        { steamId, title: { cn: '获得会员经验', en: 'Get Member Experience' }, memberPoint: 100 },
        {
          steamId,
          title: { cn: '补签会员经验 x3天', en: 'Member Check-in Catch-up x3 day(s)' },
          memberPoint: 300,
        },
      ]),
    );
    expect(memberPointInfos).toHaveLength(2);

    const member = await membersRepository.findById(steamId.toString());
    expect(member.lastDailyDate).toEqual(new Date('2026-08-05T00:00:00.000Z'));
  });

  it('长期未登录，漏签天数超过封顶：补签响应封顶 x7天，不超发', async () => {
    const steamId = 400000003;
    mockDate('2026-07-01T00:00:00.000Z');
    await post(app, memberPostUrl, { steamId, month: 3, level: MemberLevel.NORMAL });

    const result1 = await callGameStart(app, [steamId]);
    expect(result1.status).toEqual(200);

    // 漏签 18 天后才登录
    mockDate('2026-07-20T00:00:00.000Z');
    const result2 = await callGameStart(app, [steamId]);
    expect(result2.status).toEqual(200);
    const memberPointInfos = result2.body.pointInfo.filter((p) => p.steamId === steamId);
    expect(memberPointInfos).toEqual(
      expect.arrayContaining([
        {
          steamId,
          title: { cn: '补签会员经验 x7天', en: 'Member Check-in Catch-up x7 day(s)' },
          memberPoint: 700,
        },
      ]),
    );
  });

  it('断档过期后重新购买，本周期第一次登录：不补断档前的漏签，且续费没有清空 lastDailyDate（回归 bug）', async () => {
    const steamId = 400000004;
    mockDate('2026-06-01T00:00:00.000Z');
    await post(app, memberPostUrl, { steamId, month: 1, level: MemberLevel.NORMAL });

    // 签到一次后不再登录，直到会员过期
    const beforeExpire = await callGameStart(app, [steamId]);
    expect(beforeExpire.status).toEqual(200);
    const memberBeforeRepurchase = await membersRepository.findById(steamId.toString());
    expect(memberBeforeRepurchase.lastDailyDate).toEqual(new Date('2026-06-01T00:00:00.000Z'));

    // 会员完全过期很久之后才重新购买
    mockDate('2026-08-01T00:00:00.000Z');
    await post(app, memberPostUrl, { steamId, month: 1, level: MemberLevel.NORMAL });

    // 回归 bug：重新购买不应清空原有的 lastDailyDate 字段
    const memberAfterRepurchase = await membersRepository.findById(steamId.toString());
    expect(memberAfterRepurchase.lastDailyDate).toEqual(new Date('2026-06-01T00:00:00.000Z'));
    expect(memberAfterRepurchase.periodStartDate).toEqual(new Date('2026-08-01T00:00:00.000Z'));

    // 重新购买当天登录：只有当日积分，断档期间（6/1~8/1）不计入补签
    const result = await callGameStart(app, [steamId]);
    expect(result.status).toEqual(200);
    const memberPointInfos = result.body.pointInfo.filter((p) => p.steamId === steamId);
    expect(memberPointInfos).toEqual([
      { steamId, title: { cn: '获得会员经验', en: 'Get Member Experience' }, memberPoint: 100 },
    ]);
  });

  it('断档过期后重新购买，隔几天才登录：只补重新购买之后的天数', async () => {
    const steamId = 400000005;
    mockDate('2026-06-01T00:00:00.000Z');
    await post(app, memberPostUrl, { steamId, month: 1, level: MemberLevel.NORMAL });
    await callGameStart(app, [steamId]);

    // 完全过期后重新购买
    mockDate('2026-08-01T00:00:00.000Z');
    await post(app, memberPostUrl, { steamId, month: 1, level: MemberLevel.NORMAL });

    // 重新购买后又漏签 4 天才登录
    mockDate('2026-08-05T00:00:00.000Z');
    const result = await callGameStart(app, [steamId]);
    expect(result.status).toEqual(200);
    const memberPointInfos = result.body.pointInfo.filter((p) => p.steamId === steamId);
    expect(memberPointInfos).toEqual(
      expect.arrayContaining([
        {
          steamId,
          title: { cn: '补签会员经验 x4天', en: 'Member Check-in Catch-up x4 day(s)' },
          memberPoint: 400,
        },
      ]),
    );
  });

  it('续费/升级（会员本身仍有效未过期）：周期不重置，续费前的漏签在续费后登录仍能补签', async () => {
    const steamId = 400000006;
    mockDate('2026-08-01T00:00:00.000Z');
    await post(app, memberPostUrl, { steamId, month: 1, level: MemberLevel.NORMAL });
    await callGameStart(app, [steamId]);

    // 会员仍然有效时续费升级为高级会员
    mockDate('2026-08-03T00:00:00.000Z');
    const upgradeResult = await post(app, memberPostUrl, {
      steamId,
      month: 1,
      level: MemberLevel.PREMIUM,
    });
    expect(upgradeResult.status).toEqual(201);

    const memberAfterUpgrade = await membersRepository.findById(steamId.toString());
    expect(memberAfterUpgrade.periodStartDate).toEqual(new Date('2026-08-01T00:00:00.000Z'));

    // 升级操作本身不是登录，8/1 之后（8/2、8/3、8/4）都算漏签，8/5 登录时一并补上
    mockDate('2026-08-05T00:00:00.000Z');
    const result = await callGameStart(app, [steamId]);
    expect(result.status).toEqual(200);
    const memberPointInfos = result.body.pointInfo.filter((p) => p.steamId === steamId);
    expect(memberPointInfos).toEqual(
      expect.arrayContaining([
        {
          steamId,
          title: { cn: '补签会员经验 x3天', en: 'Member Check-in Catch-up x3 day(s)' },
          memberPoint: 300,
        },
      ]),
    );
  });

  it('完全过期（超过 1 天宽限）后才登录：不补签，也不发任何会员积分', async () => {
    const steamId = 400000007;
    mockDate('2026-06-01T00:00:00.000Z');
    await post(app, memberPostUrl, { steamId, month: 1, level: MemberLevel.NORMAL });
    await callGameStart(app, [steamId]);

    // 会员完全过期很久之后才登录，且没有重新购买
    mockDate('2026-08-01T00:00:00.000Z');
    const result = await callGameStart(app, [steamId]);
    expect(result.status).toEqual(200);
    const memberPointInfos = result.body.pointInfo.filter((p) => p.steamId === steamId);
    expect(memberPointInfos).toEqual([]);
  });
});
