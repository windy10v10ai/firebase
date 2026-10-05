import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import { LAUNCHER_ROOM_MAPS, LauncherRoomMap } from '../entities/launcher-room.entity';

const MAX_CANDIDATES = 8;
const MAX_KICKED = 50;
// 类型前缀让加入者知道连通的是哪条路，房主才能上报 lan / upnp / punch
const CANDIDATE_PATTERN = /^(lan|stun|upnp):\d{1,3}(\.\d{1,3}){3}:\d{1,5}$/;

export const JOIN_PATHS = ['lan', 'upnp', 'punch', 'relay'] as const;
export type JoinPath = (typeof JOIN_PATHS)[number];

class LauncherPeerDto {
  @ApiProperty()
  @IsInt()
  steamId: number;

  @ApiProperty({
    description: '候选地址，类型:IPv4:端口，类型为 lan / stun / upnp',
    type: [String],
  })
  @IsArray()
  @ArrayMaxSize(MAX_CANDIDATES)
  @Matches(CANDIDATE_PATTERN, { each: true })
  candidates: string[];

  @ApiProperty({ description: '路由器是否成功开了 UPnP 端口' })
  @IsBoolean()
  upnp: boolean;

  @ApiPropertyOptional({
    description: '两台 STUN 服务器看到的端口是否不同，即对称型 NAT；只拿到一个结果时不传',
  })
  @IsOptional()
  @IsBoolean()
  symmetricNat?: boolean;

  @ApiProperty({ description: '隧道协议版本，双方不同时拒绝加入' })
  @IsInt()
  @Min(1)
  protocolVersion: number;

  @ApiProperty()
  @IsString()
  launcherVersion: string;

  @ApiPropertyOptional({ description: '本机已安装地图的 manifest，双方都有且不同时拒绝加入' })
  @IsOptional()
  @IsString()
  mapVersion?: string;
}

export class JoinResultDto {
  @ApiProperty()
  @IsString()
  joinId: string;

  @ApiPropertyOptional({ enum: JOIN_PATHS, description: '连通所走的路，未连通时省略' })
  @IsOptional()
  @IsIn(JOIN_PATHS)
  path?: JoinPath;

  @ApiProperty({ description: '房主拿到加入请求到连通或放弃的毫秒数' })
  @IsInt()
  @Min(0)
  elapsedMs: number;
}

export class HostRoomDto extends LauncherPeerDto {
  @ApiPropertyOptional({ description: '省略时开新房，带上时为轮询' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  token?: string;

  @ApiProperty({ description: 'STUN 查到的地址等于 UPnP 外部地址，即路由器有公网 IP' })
  @IsBoolean()
  publicIp: boolean;

  @ApiPropertyOptional({ type: [JoinResultDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JoinResultDto)
  results?: JoinResultDto[];

  @ApiPropertyOptional({ description: '进入选英雄时传 true，之后不再接受加入' })
  @IsOptional()
  @IsBoolean()
  started?: boolean;

  @ApiPropertyOptional({ description: '是否进房间列表，省略按私密处理' })
  @IsOptional()
  @IsBoolean()
  public?: boolean;

  @ApiPropertyOptional({ minimum: 2, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(10)
  maxPlayers?: number;

  @ApiPropertyOptional({ enum: LAUNCHER_ROOM_MAPS })
  @IsOptional()
  @IsIn(LAUNCHER_ROOM_MAPS)
  map?: LauncherRoomMap;

  @ApiPropertyOptional({ description: '房里当前人数，含房主' })
  @IsOptional()
  @IsInt()
  @Min(1)
  playerCount?: number;

  @ApiPropertyOptional({ description: '房主到中转的往返毫秒数，加入者据此估算走中转的延迟' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  relayRtt?: number;

  @ApiPropertyOptional({ description: '被移出的 32 位账号 ID，每次传完整名单', type: [Number] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_KICKED)
  @IsInt({ each: true })
  kickedSteamIds?: number[];
}

export class JoinRoomDto extends LauncherPeerDto {
  @ApiPropertyOptional({ description: '测试连通：只交换地址量延迟，不进游戏' })
  @IsOptional()
  @IsBoolean()
  probe?: boolean;
}

export class ListRoomsDto {
  @ApiProperty()
  @IsInt()
  steamId: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  protocolVersion: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mapVersion?: string;
}

export class LauncherProfileDto {
  @ApiPropertyOptional({ description: 'Steam 昵称，取不到时省略' })
  personaName?: string;
  @ApiPropertyOptional({ description: 'Steam 头像地址，取不到时省略' })
  avatarUrl?: string;
}

export class RelayDto {
  @ApiProperty({ description: '中转服务器的 IP:端口' })
  address: string;
  @ApiProperty({ description: 'API 签的通行证，启动器原样交给中转' })
  ticket: string;
}

export class PendingJoinDto extends LauncherProfileDto {
  @ApiProperty()
  joinId: string;
  @ApiProperty({ description: '加入者自报的 32 位账号 ID，房主用它对上专用服日志里进入游戏的玩家' })
  steamId: number;
  @ApiProperty()
  joinToken: string;
  @ApiProperty({ type: [String] })
  candidates: string[];
  @ApiProperty({ description: '测试连通，打通后不加进玩家列表' })
  probe: boolean;
  @ApiPropertyOptional({
    type: RelayDto,
    description: '房主的中转通行证，没配中转或测试连通时省略',
  })
  relay?: RelayDto;
}

export class HostRoomResponse extends LauncherProfileDto {
  @ApiProperty()
  code: string;
  @ApiProperty()
  token: string;
  @ApiProperty({ type: [PendingJoinDto] })
  joins: PendingJoinDto[];
  @ApiPropertyOptional({ description: '中转地址，房主测到中转的延迟用，没配中转时省略' })
  relayAddress?: string;
}

export class JoinRoomResponse {
  @ApiProperty()
  joinId: string;
  @ApiProperty()
  joinToken: string;
  @ApiProperty({ type: [String] })
  hostCandidates: string[];
  @ApiProperty({ type: LauncherProfileDto })
  host: LauncherProfileDto;
  @ApiProperty({ type: LauncherProfileDto, description: '加入者自己' })
  self: LauncherProfileDto;
  @ApiPropertyOptional({
    type: RelayDto,
    description: '加入者的中转通行证，没配中转或测试连通时省略',
  })
  relay?: RelayDto;
}

export class PublicRoomDto extends LauncherProfileDto {
  @ApiProperty()
  code: string;
  @ApiPropertyOptional({ enum: LAUNCHER_ROOM_MAPS })
  map?: LauncherRoomMap;
  @ApiPropertyOptional()
  playerCount?: number;
  @ApiPropertyOptional()
  maxPlayers?: number;
  @ApiPropertyOptional({ description: '房主到中转的往返毫秒数，房主没测到时省略' })
  hostRelayRtt?: number;
}

export class ListRoomsResponse {
  @ApiProperty({ type: [PublicRoomDto] })
  rooms: PublicRoomDto[];
  @ApiProperty({ description: '仍在进行的公开游戏数' })
  activeGames: number;
  @ApiProperty({ description: '仍在进行的公开游戏玩家数' })
  activePlayers: number;
  @ApiPropertyOptional({ description: '中转地址，测自己到中转的延迟用，没配中转时省略' })
  relayAddress?: string;
}
