import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { logger } from 'firebase-functions/v2';

import { AfdianService } from '../afdian/afdian.service';
import { Public } from '../util/auth/public.decorator';

import { AdminService } from './admin.service';
import { ActiveAfdianOrderDto } from './dto/active-afdian-order.dto';
import { CreateAfdianMemberDto } from './dto/create-afdian-member.dto';
import { CreatePatreonMemberDto } from './dto/create-patreon-member.dto';

@Public()
@ApiTags('Admin')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly afdianService: AfdianService,
  ) {}

  @Post('/member/afdian')
  createAfdianMember(@Body() createAfdianMemberDto: CreateAfdianMemberDto) {
    return this.adminService.createAfdianMember(createAfdianMemberDto);
  }

  @Post('/member/patreon')
  createPatreonMember(@Body() createPatreonMemberDto: CreatePatreonMemberDto) {
    return this.adminService.createPatreonMember(createPatreonMemberDto);
  }

  @Get('/afdian/check')
  afdianCheck() {
    return this.afdianService.check();
  }

  @Get('/afdian/order/fail')
  findFailed() {
    return this.afdianService.findFailed();
  }

  @Post('/afdian/order/ative')
  activeOrder(@Body() dto: ActiveAfdianOrderDto) {
    return this.afdianService.activeOrderManual(dto.outTradeNo, dto.steamId);
  }

  @Post('/afdian/order/set-success')
  setOrderSuccess(@Body() dto: ActiveAfdianOrderDto) {
    return this.afdianService.setOrderSuccess(dto.outTradeNo, dto.steamId);
  }

  @Get('/test')
  test() {
    logger.info('test called');
  }
}
