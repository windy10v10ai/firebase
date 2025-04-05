import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';

import { CreateMemberDto } from './dto/create-member.dto';
import { MemberLevel } from './entities/members.entity';
import { MembersService } from './members.service';

@ApiTags('Members')
@Controller('members')
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  // 追加会员月份
  @ApiBody({ type: CreateMemberDto })
  @Post()
  create(@Body() createMemberDto: CreateMemberDto) {
    // FIXME 改用createMember同时修正e2e测试
    if (createMemberDto.level == MemberLevel.NORMAL) {
      return this.membersService.addNormalMember(createMemberDto.steamId, createMemberDto.month);
    } else {
      return this.membersService.addPremiumMember(createMemberDto.steamId, createMemberDto.month);
    }
  }

  @Get(':id')
  find(
    @Param('id', new ParseIntPipe())
    steamId: number,
  ) {
    return this.membersService.findBySteamId(steamId);
  }
}
