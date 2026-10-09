import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBase64,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import {
  FEEDBACK_SOURCES,
  FEEDBACK_TOPICS,
  FEEDBACK_TYPES,
  FeedbackSource,
  FeedbackTopic,
  FeedbackType,
  LAUNCHER_MODES,
  LauncherMode,
} from '../entities/feedback-report.entity';

export const MAX_TOPICS = 2;
export const MAX_DESCRIPTION_LENGTH = 1000;
export const MAX_LOG_BYTES = 1024 * 1024;
const MAX_LOG_BASE64_LENGTH = Math.ceil(MAX_LOG_BYTES / 3) * 4;

class LauncherErrorDto {
  @ApiProperty({ description: '玩家看到的报错原文' })
  @IsString()
  @MaxLength(1000)
  message: string;

  @ApiPropertyOptional({ description: '出错时在做什么，如启动服务器、开房、加入' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  stage?: string;

  @ApiPropertyOptional({ description: '异常类型与调用栈' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  detail?: string;
}

class GameStateDto {
  @ApiPropertyOptional({ description: '游戏内已进行的秒数' })
  @IsOptional()
  @IsInt()
  @Min(0)
  gameTime?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  heroName?: string;

  @ApiPropertyOptional({ description: '这局跑在玩家自己的机器上' })
  @IsOptional()
  @IsBoolean()
  localHost?: boolean;

  @ApiPropertyOptional({ description: '这局没连上服务器' })
  @IsOptional()
  @IsBoolean()
  offline?: boolean;
}

export class CreateFeedbackDto {
  @ApiPropertyOptional({ enum: FEEDBACK_SOURCES, description: '不传按启动器处理，兼容旧版启动器' })
  @IsOptional()
  @IsIn(FEEDBACK_SOURCES)
  source?: FeedbackSource;

  @ApiProperty({ enum: FEEDBACK_TYPES })
  @IsIn(FEEDBACK_TYPES)
  type: FeedbackType;

  @ApiProperty({ enum: FEEDBACK_TOPICS, isArray: true, maxItems: MAX_TOPICS })
  @IsArray()
  @ArrayMaxSize(MAX_TOPICS)
  @ArrayUnique()
  @IsIn(FEEDBACK_TOPICS, { each: true })
  topics: FeedbackTopic[];

  @ApiPropertyOptional({ description: '提建议时必填', maxLength: MAX_DESCRIPTION_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_DESCRIPTION_LENGTH)
  description?: string;

  @ApiPropertyOptional({ description: 'Steam 32 位账号 ID，读不到时不传' })
  @IsOptional()
  @IsInt()
  @Min(1)
  steamId?: number;

  @ApiPropertyOptional({ description: '来源为启动器时必填' })
  @ValidateIf((dto: CreateFeedbackDto) => dto.source !== 'game')
  @IsString()
  @MaxLength(20)
  launcherVersion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  mapVersion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  windowsVersion?: string;

  @ApiPropertyOptional({ enum: LAUNCHER_MODES })
  @IsOptional()
  @IsIn(LAUNCHER_MODES)
  mode?: LauncherMode;

  @ApiPropertyOptional({ type: LauncherErrorDto, description: '从报错条进入时附带，不给玩家看' })
  @IsOptional()
  @ValidateNested()
  @Type(() => LauncherErrorDto)
  launcherError?: LauncherErrorDto;

  @ApiPropertyOptional({ type: GameStateDto, description: '来源为游戏时附带' })
  @IsOptional()
  @ValidateNested()
  @Type(() => GameStateDto)
  gameState?: GameStateDto;

  @ApiPropertyOptional({ description: '专用服日志，gzip 后 base64，压缩后不超过 1MB' })
  @IsOptional()
  @IsBase64()
  @MaxLength(MAX_LOG_BASE64_LENGTH)
  serverLog?: string;

  @ApiPropertyOptional({ description: '客户端日志，gzip 后 base64，压缩后不超过 1MB' })
  @IsOptional()
  @IsBase64()
  @MaxLength(MAX_LOG_BASE64_LENGTH)
  clientLog?: string;
}
