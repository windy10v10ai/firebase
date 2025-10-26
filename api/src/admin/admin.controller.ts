import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AfdianService } from '../afdian/afdian.service';
import { ActiveAfdianOrderDto } from '../afdian/dto/active-afdian-order.dto';
import { CreateMemberDto } from '../members/dto/create-member.dto';
import { MembersService } from '../members/members.service';
import { Public } from '../util/auth/public.decorator';

import { AdminService } from './admin.service';
import { CreatePatreonMemberDto } from './dto/create-patreon-member.dto';

@Public()
@ApiTags('Admin')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly afdianService: AfdianService,
    private readonly membersService: MembersService,
  ) {}

  @Post('/member')
  createMember(@Body() createMemberDto: CreateMemberDto) {
    return this.membersService.createMember(createMemberDto);
  }

  @Post('/member/patreon')
  createPatreonMember(@Body() createPatreonMemberDto: CreatePatreonMemberDto) {
    return this.adminService.createPatreonMember(createPatreonMemberDto);
  }

  @Get('/afdian/order/fail')
  findFailed() {
    return this.afdianService.findFailed();
  }

  @Post('/afdian/order/ative')
  activeOrder(@Body() dto: ActiveAfdianOrderDto) {
    return this.afdianService.activeOrderManual(dto.outTradeNo, dto.steamId);
  }

  @Post('/afdian/order/active-recent')
  activeRecentOrder() {
    return this.afdianService.activeRecentOrder(100);
  }

  @Post('/migration/player-setting-passive-ability-key2')
  async migratePlayerSettingPassiveAbilityKey2() {
    return await this.adminService.migratePlayerSettingPassiveAbilityKey2();
  }
}
