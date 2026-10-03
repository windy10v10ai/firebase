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
  Min,
  ValidateNested,
} from 'class-validator';

const MAX_CANDIDATES = 8;
const CANDIDATE_PATTERN = /^\d{1,3}(\.\d{1,3}){3}:\d{1,5}$/;

export const JOIN_PATHS = ['lan', 'upnp', 'punch'] as const;
export type JoinPath = (typeof JOIN_PATHS)[number];

class LauncherPeerDto {
  @ApiProperty()
  @IsInt()
  steamId: number;

  @ApiProperty({ description: '候选地址，IPv4:端口', type: [String] })
  @IsArray()
  @ArrayMaxSize(MAX_CANDIDATES)
  @Matches(CANDIDATE_PATTERN, { each: true })
  candidates: string[];

  @ApiProperty({ description: '路由器是否成功开了 UPnP 端口' })
  @IsBoolean()
  upnp: boolean;

  @ApiProperty({ description: '隧道协议版本，双方不同时拒绝加入' })
  @IsInt()
  @Min(1)
  protocolVersion: number;

  @ApiProperty()
  @IsString()
  launcherVersion: string;
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
}

export class JoinRoomDto extends LauncherPeerDto {}

export class PendingJoinDto {
  @ApiProperty()
  joinId: string;
  @ApiProperty()
  joinToken: string;
  @ApiProperty({ type: [String] })
  candidates: string[];
}

export class HostRoomResponse {
  @ApiProperty()
  code: string;
  @ApiProperty()
  token: string;
  @ApiProperty({ type: [PendingJoinDto] })
  joins: PendingJoinDto[];
}

export class JoinRoomResponse {
  @ApiProperty()
  joinId: string;
  @ApiProperty()
  joinToken: string;
  @ApiProperty({ type: [String] })
  hostCandidates: string[];
}
