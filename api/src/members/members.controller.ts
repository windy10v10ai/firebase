import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';

import { CreateMemberDto } from './dto/create-member.dto';
import { MembersService } from './members.service';

@ApiTags('Members')
@Controller('members')
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  // 开通会员 指定月份
  @ApiBody({ type: CreateMemberDto })
  @Post()
  create(@Body() createMemberDto: CreateMemberDto) {
    return this.membersService.addMember(createMemberDto);
  }

  @Get(':id')
  find(
    @Param('id', new ParseIntPipe())
    steamId: number,
  ) {
    return this.membersService.find(steamId);
  }

  @Delete(':id')
  remove(
    @Param('id', new ParseIntPipe())
    steamId: number,
  ) {
    return this.membersService.remove(steamId);
  }
}
