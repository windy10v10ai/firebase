import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AfdianService } from '../afdian/afdian.service';
import { CreateMemberDto } from '../members/dto/create-member.dto';
import { Public } from '../util/auth/public.decorator';

import { AdminService } from './admin.service';
import { ActiveAfdianOrderDto } from './dto/active-afdian-order.dto';
import { CreatePatreonMemberDto } from './dto/create-patreon-member.dto';

@Public()
@ApiTags('Admin')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly afdianService: AfdianService,
  ) {}

  @Post('/member')
  createMember(@Body() createMemberDto: CreateMemberDto) {
    return this.adminService.createMember(createMemberDto);
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
}
