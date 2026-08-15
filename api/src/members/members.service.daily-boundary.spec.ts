import { ChallengeDayClockService } from '../util/challenge-day-clock.service';

import { Member, MemberLevel } from './entities/members.entity';
import { MembersService } from './members.service';

describe('MembersService daily reward boundary', () => {
  it('uses ChallengeDayClockService instead of maintaining a second day boundary', () => {
    const clock = {
      getWindow: jest.fn().mockReturnValue({
        dayId: '2026-08-04',
        startsAt: new Date(2026, 7, 4, 0, 0, 0, 0),
        endsAt: new Date(2026, 7, 5, 0, 0, 0, 0),
        closesAt: new Date(2026, 7, 5, 2, 0, 0, 0),
      }),
    } as unknown as ChallengeDayClockService;
    const service = new MembersService({} as never, {} as never, clock);
    const member = {
      steamId: 1,
      expireDate: new Date(2099, 0, 1),
      level: MemberLevel.PREMIUM,
      lastDailyDate: new Date(2026, 7, 3, 23, 59, 59, 999),
    } as Member;

    expect(service.getDailyMemberPoint(member)).toBe(100);
    expect(clock.getWindow).toHaveBeenCalledTimes(1);
  });
});
