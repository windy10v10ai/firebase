import { BaseFirestoreRepository } from 'fireorm';

import { Member, MemberLevel } from './entities/members.entity';
import { MembersService } from './members.service';

function buildMember(overrides: Partial<Member> = {}): Member {
  return {
    id: '1',
    steamId: 1,
    expireDate: new Date('2099-01-01T00:00:00Z'),
    level: MemberLevel.NORMAL,
    ...overrides,
  };
}

describe('MembersService.getCheckInPoints', () => {
  const service = new MembersService(null, null);

  afterEach(() => {
    jest.useRealTimers();
  });

  it('连续每天登录：只发当日积分，不补签', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-10T00:00:00Z'));
    const member = buildMember({
      periodStartDate: new Date('2026-07-01T00:00:00Z'),
      lastDailyDate: new Date('2026-08-09T00:00:00Z'),
    });

    expect(service.getCheckInPoints(member)).toEqual({
      dailyPoint: 100,
      catchUpDays: 0,
      catchUpPoint: 0,
    });
  });

  it('漏签 3 天（未断档，一直是会员）：补签 3 天', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-10T00:00:00Z'));
    const member = buildMember({
      periodStartDate: new Date('2026-07-01T00:00:00Z'),
      lastDailyDate: new Date('2026-08-06T00:00:00Z'),
    });

    expect(service.getCheckInPoints(member)).toEqual({
      dailyPoint: 100,
      catchUpDays: 3,
      catchUpPoint: 300,
    });
  });

  it('漏签天数超过封顶：补签封顶 7 天，不多发', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-10T00:00:00Z'));
    const member = buildMember({
      periodStartDate: new Date('2026-07-01T00:00:00Z'),
      lastDailyDate: new Date('2026-07-22T00:00:00Z'),
    });

    expect(service.getCheckInPoints(member)).toEqual({
      dailyPoint: 100,
      catchUpDays: 7,
      catchUpPoint: 700,
    });
  });

  it('断档过期后重新购买，本周期第一次登录：不补断档前的漏签', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-01T00:00:00Z'));
    const member = buildMember({
      periodStartDate: new Date('2026-08-01T00:00:00Z'),
      lastDailyDate: new Date('2026-07-20T00:00:00Z'), // 上一周期遗留的旧记录
    });

    expect(service.getCheckInPoints(member)).toEqual({
      dailyPoint: 100,
      catchUpDays: 0,
      catchUpPoint: 0,
    });
  });

  it('断档过期后重新购买，隔几天才登录：只补重新购买之后的天数', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-05T00:00:00Z'));
    const member = buildMember({
      periodStartDate: new Date('2026-08-01T00:00:00Z'),
      lastDailyDate: new Date('2026-07-20T00:00:00Z'), // 断档前的旧记录，不应计入
    });

    expect(service.getCheckInPoints(member)).toEqual({
      dailyPoint: 100,
      catchUpDays: 4,
      catchUpPoint: 400,
    });
  });

  it('续费/升级（周期不重置）：续费前的漏签在续费后登录仍能补签', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-10T00:00:00Z'));
    const member = buildMember({
      level: MemberLevel.PREMIUM,
      periodStartDate: new Date('2026-07-01T00:00:00Z'), // 续费未重置
      lastDailyDate: new Date('2026-08-07T00:00:00Z'),
    });

    expect(service.getCheckInPoints(member)).toEqual({
      dailyPoint: 100,
      catchUpDays: 2,
      catchUpPoint: 200,
    });
  });

  it('当日已领取：dailyPoint 为 0，也不补签', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-10T00:00:00Z'));
    const member = buildMember({
      periodStartDate: new Date('2026-07-01T00:00:00Z'),
      lastDailyDate: new Date('2026-08-10T00:00:00Z'),
    });

    expect(service.getCheckInPoints(member)).toEqual({
      dailyPoint: 0,
      catchUpDays: 0,
      catchUpPoint: 0,
    });
  });

  it('完全过期（超过 1 天宽限）：不补签，也不发当日积分', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-10T00:00:00Z'));
    const member = buildMember({
      expireDate: new Date('2026-08-08T00:00:00Z'),
      periodStartDate: new Date('2026-07-01T00:00:00Z'),
      lastDailyDate: new Date('2026-07-20T00:00:00Z'),
    });

    expect(service.getCheckInPoints(member)).toEqual({
      dailyPoint: 0,
      catchUpDays: 0,
      catchUpPoint: 0,
    });
  });

  it('历史数据缺失 periodStartDate，但有 lastDailyDate：按 lastDailyDate 计算', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-10T00:00:00Z'));
    const member = buildMember({
      lastDailyDate: new Date('2026-08-06T00:00:00Z'),
    });

    expect(service.getCheckInPoints(member)).toEqual({
      dailyPoint: 100,
      catchUpDays: 3,
      catchUpPoint: 300,
    });
  });

  it('历史数据 periodStartDate 与 lastDailyDate 均缺失：视为今天是第一天，不补签', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-10T00:00:00Z'));
    const member = buildMember();

    expect(service.getCheckInPoints(member)).toEqual({
      dailyPoint: 100,
      catchUpDays: 0,
      catchUpPoint: 0,
    });
  });
});

describe('MembersService.updateMemberExpireDate', () => {
  function createFakeRepository(initial?: Member) {
    let store: Member | undefined = initial;
    return {
      findById: jest.fn(async () => store),
      create: jest.fn(async (member: Member) => {
        store = member;
        return member;
      }),
      update: jest.fn(async (member: Member) => {
        store = member;
        return member;
      }),
    } as unknown as BaseFirestoreRepository<Member>;
  }

  it('全新会员：new 一个完整对象，periodStartDate = baseDate', async () => {
    const repository = createFakeRepository(undefined);
    const service = new MembersService(repository, null);
    const baseDate = new Date('2026-08-01T00:00:00Z');

    await service.updateMemberExpireDate(null, 999, baseDate, 31, MemberLevel.NORMAL, true);

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ steamId: 999, periodStartDate: baseDate }),
    );
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('续费（resetPeriodStart=false）：只更新 expireDate/level，lastDailyDate 与 periodStartDate 原样保留', async () => {
    const existMember = buildMember({
      steamId: 999,
      id: '999',
      expireDate: new Date('2026-08-10T00:00:00Z'),
      lastDailyDate: new Date('2026-08-05T00:00:00Z'),
      periodStartDate: new Date('2026-07-01T00:00:00Z'),
    });
    const repository = createFakeRepository(existMember);
    const service = new MembersService(repository, null);

    await service.updateMemberExpireDate(
      existMember,
      999,
      existMember.expireDate,
      31,
      MemberLevel.NORMAL,
      false,
    );

    expect(repository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        lastDailyDate: new Date('2026-08-05T00:00:00Z'),
        periodStartDate: new Date('2026-07-01T00:00:00Z'),
      }),
    );
  });

  it('过期后重新购买（resetPeriodStart=true）：periodStartDate 重置为 baseDate，lastDailyDate 字段本身不被清空', async () => {
    const existMember = buildMember({
      steamId: 999,
      id: '999',
      expireDate: new Date('2026-07-01T00:00:00Z'),
      lastDailyDate: new Date('2026-06-25T00:00:00Z'),
      periodStartDate: new Date('2026-06-01T00:00:00Z'),
    });
    const repository = createFakeRepository(existMember);
    const service = new MembersService(repository, null);
    const baseDate = new Date('2026-08-01T00:00:00Z');

    await service.updateMemberExpireDate(existMember, 999, baseDate, 31, MemberLevel.NORMAL, true);

    expect(repository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        periodStartDate: baseDate,
        // 字段本身没有被覆写/清空（是否参与补签计算由 getCheckInPoints 的周期判断负责）
        lastDailyDate: new Date('2026-06-25T00:00:00Z'),
      }),
    );
  });
});
