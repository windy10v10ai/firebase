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
const MAX_QUALITY = 50;
const MAX_PLAYERS = 10;
const MAX_RELAYS = 8;
const RELAY_ADDRESS_PATTERN = /^\d{1,3}(\.\d{1,3}){3}:\d{1,5}$/;
// 类型前缀让加入者知道连通的是哪条路，房主才能上报 lan / upnp / punch
const CANDIDATE_PATTERN = /^(lan|stun|upnp):\d{1,3}(\.\d{1,3}){3}:\d{1,5}$/;

export const JOIN_PATHS = ['lan', 'upnp', 'punch', 'relay'] as const;
export type JoinPath = (typeof JOIN_PATHS)[number];

export class RelayProbeDto {
  @ApiProperty({ description: '中转的 IP:端口，取自 API 下发的列表' })
  @Matches(RELAY_ADDRESS_PATTERN)
  address: string;

  @ApiPropertyOptional({ description: '最快一次往返的毫秒数，全部丢失时省略' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  rtt?: number;

  @ApiProperty({ description: '回声测试的丢失百分比' })
  @IsInt()
  @Min(0)
  @Max(100)
  loss: number;
}

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

  @ApiPropertyOptional({
    description: '本机到中转的往返毫秒数；房主的用来给加入者估算走中转的延迟，加入者的只做统计',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  relayRtt?: number;

  @ApiPropertyOptional({ description: '本机向中转发回声测试的丢失百分比，没测时省略' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  relayLoss?: number;

  @ApiPropertyOptional({
    type: [RelayProbeDto],
    description: '本机到每台中转的测量结果；房主随轮询更新，加入者的用来挑这次加入走哪台',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_RELAYS)
  @ValidateNested({ each: true })
  @Type(() => RelayProbeDto)
  relays?: RelayProbeDto[];

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

  @ApiPropertyOptional({ description: '走中转时连上的是哪台，旧版启动器不报' })
  @IsOptional()
  @Matches(RELAY_ADDRESS_PATTERN)
  relayAddress?: string;

  @ApiProperty({ description: '房主拿到加入请求到连通或放弃的毫秒数' })
  @IsInt()
  @Min(0)
  elapsedMs: number;
}

export class ConnectionQualityDto {
  @ApiProperty()
  @IsString()
  joinId: string;

  @ApiProperty({ enum: JOIN_PATHS, description: '这段时间里房主与加入者之间实际在用的路' })
  @IsIn(JOIN_PATHS)
  path: JoinPath;

  @ApiPropertyOptional({ description: '走中转时在用的是哪台，旧版启动器不报' })
  @IsOptional()
  @Matches(RELAY_ADDRESS_PATTERN)
  relayAddress?: string;

  @ApiProperty({ description: '房主发给加入者的测速包数' })
  @IsInt()
  @Min(1)
  @Max(10000)
  sent: number;

  @ApiProperty({ description: '没收到回音的测速包数' })
  @IsInt()
  @Min(0)
  @Max(10000)
  lost: number;

  @ApiPropertyOptional({ description: '往返毫秒数的中位数，全部丢失时省略' })
  @IsOptional()
  @IsInt()
  @Min(0)
  rttP50?: number;

  @ApiPropertyOptional({ description: '往返毫秒数的 95 分位，全部丢失时省略' })
  @IsOptional()
  @IsInt()
  @Min(0)
  rttP95?: number;
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

  @ApiPropertyOptional({
    type: [ConnectionQualityDto],
    description: '开局后每个加入者一段时间内的连接质量，每段一条',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_QUALITY)
  @ValidateNested({ each: true })
  @Type(() => ConnectionQualityDto)
  quality?: ConnectionQualityDto[];

  @ApiPropertyOptional({ description: '进入选英雄时传 true，之后不再接受加入' })
  @IsOptional()
  @IsBoolean()
  started?: boolean;

  @ApiPropertyOptional({ description: '游戏已结束时传 true，之后不再显示在列表里' })
  @IsOptional()
  @IsBoolean()
  ended?: boolean;

  @ApiPropertyOptional({
    description:
      '房里还在的加入者的 32 位账号 ID，不含房主；开局前是已连上的人，开局后是还在游戏里的人',
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PLAYERS)
  @IsInt({ each: true })
  players?: number[];

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
  @ApiProperty({ description: '中转服务器的 IP:端口，即下面顺序里的第一台，旧版启动器只认它' })
  address: string;
  @ApiProperty({
    type: [String],
    description: '这次加入要依次尝试的中转，房主与加入者拿到同一顺序，被拒绝时换下一台',
  })
  addresses: string[];
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
  @ApiPropertyOptional({ description: '旧版启动器测延迟用的那台中转，没配中转时省略' })
  relayAddress?: string;
  @ApiProperty({ type: [String], description: '要测延迟的全部中转，没配中转时为空' })
  relayAddresses: string[];
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
  @ApiPropertyOptional({ description: '房主到旧版启动器那台中转的往返毫秒数，房主没测到时省略' })
  hostRelayRtt?: number;
  @ApiPropertyOptional({
    type: [RelayProbeDto],
    description: '房主到每台中转的测量结果，加入者据此估算走中转的延迟，旧版房主省略',
  })
  hostRelays?: RelayProbeDto[];
  @ApiProperty({ type: [LauncherProfileDto], description: '房里的人，房主在第一个' })
  players: LauncherProfileDto[];
}

export class ActiveGameDto {
  @ApiProperty({ description: '好友房只给人数与时长，不给地图与玩家' })
  public: boolean;
  @ApiPropertyOptional({ enum: LAUNCHER_ROOM_MAPS })
  map?: LauncherRoomMap;
  @ApiPropertyOptional()
  playerCount?: number;
  @ApiPropertyOptional({ description: '开局至今的整分钟数，开局时间不明时省略' })
  minutes?: number;
  @ApiPropertyOptional({ type: [LauncherProfileDto], description: '公开游戏里的人，房主在第一个' })
  players?: LauncherProfileDto[];
}

export class ListRoomsResponse {
  @ApiProperty({ type: [PublicRoomDto] })
  rooms: PublicRoomDto[];
  @ApiProperty({ type: [ActiveGameDto], description: '仍在进行的游戏，含好友房，开局早的在前' })
  games: ActiveGameDto[];
  @ApiProperty({ description: '仍在进行的公开游戏数，给只认这一项的旧版启动器' })
  activeGames: number;
  @ApiProperty({ description: '仍在进行的公开游戏玩家数' })
  activePlayers: number;
  @ApiPropertyOptional({ description: '旧版启动器测延迟用的那台中转，没配中转时省略' })
  relayAddress?: string;
  @ApiProperty({ type: [String], description: '要测延迟的全部中转，没配中转时为空' })
  relayAddresses: string[];
}
