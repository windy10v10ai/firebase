import { Injectable } from '@nestjs/common';

import { CreateMemberDto } from '../members/dto/create-member.dto';
import { MemberLevel } from '../members/entities/members.entity';
import { MembersService } from '../members/members.service';
import { PlayerService } from '../player/player.service';
import { NORMAL_MEMBER_MONTHLY_POINT, PREMIUM_MEMBER_MONTHLY_POINT } from '../util/const';

import { CreatePatreonMemberDto } from './dto/create-patreon-member.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly membersService: MembersService,
    private readonly playerService: PlayerService,
  ) {}
  async createMember(createMemberDto: CreateMemberDto) {
    const memberPointPerMonth =
      createMemberDto.level == MemberLevel.NORMAL
        ? NORMAL_MEMBER_MONTHLY_POINT
        : PREMIUM_MEMBER_MONTHLY_POINT;
    const player = await this.playerService.upsertAddPoint(createMemberDto.steamId, {
      memberPointTotal: memberPointPerMonth * createMemberDto.month,
    });

    const member =
      createMemberDto.level == MemberLevel.NORMAL
        ? await this.membersService.addNormalMember(createMemberDto.steamId, createMemberDto.month)
        : await this.membersService.addPremiumMember(
            createMemberDto.steamId,
            createMemberDto.month,
          );
    return {
      player,
      member,
    };
  }

  async createPatreonMember(createPatreonMemberDto: CreatePatreonMemberDto) {
    const expireAt = this.getEndOfNextMonth();
    const result = [];
    for (const steamId of createPatreonMemberDto.steamIds) {
      // if member expiredDate > expireAt, then skip
      const existMember = await this.membersService.findOne(steamId);
      if (existMember && existMember.expireDate.getTime() >= expireAt.getTime()) {
        continue;
      }

      const player = await this.playerService.upsertAddPoint(steamId, {
        memberPointTotal: PREMIUM_MEMBER_MONTHLY_POINT,
      });
      const member = await this.membersService.addPremiumMember(steamId, 1);
      result.push({
        player,
        member,
      });
    }
    return result;
  }

  getEndOfNextMonth() {
    const date = new Date();
    date.setMonth(date.getMonth() + 2);
    date.setUTCDate(0);
    // set start of day in utc
    date.setUTCHours(0, 0, 0, 0);
    return date;
  }
}
