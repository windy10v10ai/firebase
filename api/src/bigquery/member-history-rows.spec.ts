import { MemberLevel } from '../members/entities/members.entity';

import { buildMemberHistoryRow } from './member-history-rows';

describe('buildMemberHistoryRow', () => {
  it('记下这次买了什么，以及写入前后的等级与到期日', () => {
    const row = buildMemberHistoryRow(
      { steamId: 123, month: 3, level: MemberLevel.NORMAL },
      {
        id: '123',
        steamId: 123,
        level: MemberLevel.PREMIUM,
        expireDate: new Date('2026-10-15T00:00:00Z'),
      },
      { steamId: 123, enable: true, expireDateString: '2026-12-31', level: MemberLevel.PREMIUM },
      { reason: 'alipay_member', ref: 'order-1' },
      new Date('2026-09-30T00:00:00Z'),
    );

    expect(row).toEqual({
      created_at: '2026-09-30T00:00:00.000Z',
      steam_id: 123,
      purchased_level: MemberLevel.NORMAL,
      months: 3,
      level_before: MemberLevel.PREMIUM,
      expire_date_before: '2026-10-15',
      level_after: MemberLevel.PREMIUM,
      expire_date_after: '2026-12-31',
      reason: 'alipay_member',
      ref: 'order-1',
    });
  });

  it('从未开过会员时写入前为空', () => {
    const row = buildMemberHistoryRow(
      { steamId: 123, month: 1, level: MemberLevel.NORMAL },
      undefined,
      { steamId: 123, enable: true, expireDateString: '2026-10-31', level: MemberLevel.NORMAL },
      { reason: 'admin_member' },
      new Date('2026-09-30T00:00:00Z'),
    );

    expect(row).toMatchObject({ level_before: null, expire_date_before: null, ref: null });
  });
});
