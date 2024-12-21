import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { logger } from 'firebase-functions/v2';

import { AfdianApiService } from '../afdian/afdian.api.service';
import { AfdianService } from '../afdian/afdian.service';
import { Public } from '../util/auth/public.decorator';

import { AdminService } from './admin.service';
import { CreateAfdianMemberDto } from './dto/create-afdian-member.dto';
import { CreatePatreonMemberDto } from './dto/create-patreon-member.dto';

@Public()
@ApiTags('Admin')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly afdianService: AfdianService,
    private readonly afdianApiService: AfdianApiService,
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

  @Post('/afdian/migration')
  afdianMigration() {
    return this.afdianService.migration();
  }

  @Get('/afdian/order/fail')
  findFailed() {
    return this.afdianService.findFailed();
  }

  @Get('/afdian/order/fetch/all')
  afdianOrderFetch() {
    return this.afdianApiService.fetchAllAfdianOrder();
  }

  @Get('/test')
  test() {
    logger.info('test called');
  }
}
