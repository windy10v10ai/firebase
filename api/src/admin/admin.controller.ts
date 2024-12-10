import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { logger } from 'firebase-functions';

import { AddAllSeasonPointDto } from '../player/dto/add-all-season-point.dto';
import { ResetSeasonPoint } from '../player/dto/reset-season-point.dto';
import { PlayerService } from '../player/player.service';
import { PlayerPropertyService } from '../player-property/player-property.service';

import { AdminService } from './admin.service';
import { CreateAfdianMemberDto } from './dto/create-afdian-member.dto';
import { CreatePatreonMemberDto } from './dto/create-patreon-member.dto';
import { Public } from '../util/auth/public.decorator';

@ApiTags('Admin')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly playerService: PlayerService,
    private readonly playerPropertyService: PlayerPropertyService,
  ) {}

  @Post('/member/afdian')
  createAfdianMember(@Body() createAfdianMemberDto: CreateAfdianMemberDto) {
    return this.adminService.createAfdianMember(createAfdianMemberDto);
  }

  @Post('/member/patreon')
  createPatreonMember(@Body() createPatreonMemberDto: CreatePatreonMemberDto) {
    return this.adminService.createPatreonMember(createPatreonMemberDto);
  }

  @Post('/players/season/resetSeasonPoint')
  resetSeasonPoint(@Body() resetSeasonPoint: ResetSeasonPoint) {
    return this.playerService.resetSeasonPoint(resetSeasonPoint.resetPercent);
  }

  @Post('/players/addSeasonPoint')
  addAllSeasonPoint(@Body() addAllSeasonPoint: AddAllSeasonPointDto) {
    return this.playerService.addAllSeasonPoint(
      addAllSeasonPoint.point,
      addAllSeasonPoint.startFrom,
    );
  }

  @Post('/bug-fix/incoming-damage')
  async incomingDamage() {
    const propertys = await this.playerPropertyService.findByName(
      'property_incoming_damage_percentage',
    );
    let count = 0;
    for (const property of propertys) {
      const steamId = property.steamId;
      await this.playerService.addSeasonPoint(steamId, 1000);
      logger.debug(`[Bug Fix] Add 1000 point to ${steamId}`);
      count++;
    }
    logger.debug(`[Bug Fix] End Add 1000 point to ${count} players`);
  }
}
