import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ClientOrigin, CurrentClientOrigin } from '../util/auth/client-origin.decorator';
import { Public } from '../util/auth/public.decorator';

import {
  HostRoomDto,
  HostRoomResponse,
  JoinRoomDto,
  JoinRoomResponse,
  ListRoomsDto,
  ListRoomsResponse,
} from './dto/launcher-room.dto';
import { LauncherRoomService } from './launcher-room.service';

// 启动器 exe 里的 key 等于公开，权限靠开房、加入时发下去的随机令牌
@Public()
@ApiTags('Launcher')
@Controller('launcher/rooms')
export class LauncherRoomController {
  constructor(private readonly launcherRoomService: LauncherRoomService) {}

  @Post('host')
  @ApiOperation({ summary: 'Open a room, poll for joiners, or mark the game as started' })
  host(
    @Body() dto: HostRoomDto,
    @CurrentClientOrigin() origin: ClientOrigin,
  ): Promise<HostRoomResponse> {
    return this.launcherRoomService.host(dto, origin.country);
  }

  // 用 POST 是为了与开房、加入共用启动器的请求代码
  @Post('list')
  @ApiOperation({ summary: 'List public rooms the caller can join' })
  list(@Body() dto: ListRoomsDto): Promise<ListRoomsResponse> {
    return this.launcherRoomService.list(dto);
  }

  @Post(':code/join')
  @ApiOperation({ summary: 'Join a room by code, or probe it, and get the host candidates' })
  join(
    @Param('code') code: string,
    @Body() dto: JoinRoomDto,
    @CurrentClientOrigin() origin: ClientOrigin,
  ): Promise<JoinRoomResponse> {
    return this.launcherRoomService.join(code, dto, origin.country);
  }
}
