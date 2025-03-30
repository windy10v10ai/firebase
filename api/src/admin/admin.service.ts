import { Injectable } from '@nestjs/common';

import { MembersService } from '../members/members.service';
import { PlayerService } from '../player/player.service';

import { CreatePatreonMemberDto } from './dto/create-patreon-member.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly membersService: MembersService,
    private readonly playerService: PlayerService,
  ) {}
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
        memberPointTotal: 600,
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
