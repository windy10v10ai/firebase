import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AfdianService } from '../afdian/afdian.service';
import { CreateMemberDto } from '../members/dto/create-member.dto';
import { MembersService } from '../members/members.service';
import { PlayerPropertyResetService } from '../player-property/player-property-reset.service';
import { Public } from '../util/auth/public.decorator';

@Public()
@ApiTags('Admin')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly afdianService: AfdianService,
    private readonly membersService: MembersService,
    private readonly playerPropertyResetService: PlayerPropertyResetService,
  ) {}

  @Post('/member')
  createMember(@Body() createMemberDto: CreateMemberDto) {
    return this.membersService.createMember(createMemberDto, { reason: 'admin_member' });
  }

  @Get('/afdian/order/fail')
  findFailed() {
    return this.afdianService.findFailed();
  }

  // 清空全服所有加过点的玩家的属性加点，用于调整属性数值后让全员重新分配，不只是修正数据不一致的玩家
  @Post('/player-property/reset')
  resetPlayerProperty() {
    return this.playerPropertyResetService.resetAll();
  }
}
