import { INestApplication } from '@nestjs/common';

import { MemberDto } from '../../src/members/dto/member.dto';
import { MemberLevel } from '../../src/members/entities/members.entity';
import { MembersService } from '../../src/members/members.service';

// 会员只作为测试前置条件存在，没有对外接口，直接取 service
export function addMember(
  app: INestApplication,
  steamId: number,
  month: number,
  level: MemberLevel,
): Promise<MemberDto> {
  const membersService = app.get(MembersService);
  return level === MemberLevel.NORMAL
    ? membersService.addNormalMember(steamId, month)
    : membersService.addPremiumMember(steamId, month);
}

export function findMember(app: INestApplication, steamId: number): Promise<MemberDto> {
  return app.get(MembersService).findBySteamId(steamId);
}
