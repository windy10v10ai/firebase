import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';

import { CreateMemberDto } from './dto/create-member.dto';
import { MemberLevel } from './entities/members.entity';
import { MembersService } from './members.service';

@ApiTags('Members')
@Controller('members')
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  // 开通会员 指定月份
  @ApiBody({ type: CreateMemberDto })
  @Post()
  create(@Body() createMemberDto: CreateMemberDto) {
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
    return this.membersService.find(steamId);
  }
}
