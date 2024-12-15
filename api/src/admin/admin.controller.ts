import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { ResetSeasonPoint } from '../player/dto/reset-season-point.dto';
import { PlayerService } from '../player/player.service';
import { PlayerPropertyService } from '../player-property/player-property.service';

import { AdminService } from './admin.service';
import { CreateAfdianMemberDto } from './dto/create-afdian-member.dto';
import { CreatePatreonMemberDto } from './dto/create-patreon-member.dto';

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
}
