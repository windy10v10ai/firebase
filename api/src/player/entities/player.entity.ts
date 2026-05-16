import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional } from 'class-validator';
import { Collection } from 'fireorm';

@Collection()
export class Player {
  @ApiProperty()
  id: string;
  @ApiProperty()
  matchCount: number;
  @ApiProperty()
  winCount: number;
  @ApiProperty()
  disconnectCount: number;
  @ApiProperty()
  @IsOptional()
  @IsNumber()
  seasonPointTotal: number;
  @ApiProperty()
  @IsOptional()
  @IsNumber()
  memberPointTotal: number;
  // 已使用等级（property 升级累计消耗的 level 总和）
  @ApiProperty()
  usedLevel: number;
  // 行为分
  @ApiProperty()
  conductPoint: number;
  // 被点赞次数
  @ApiProperty({ default: 0 })
  commendCount: number;
  // 被举报次数
  @ApiProperty({ default: 0 })
  reportCount: number;
  // 最近一次游戏开始时间
  @ApiProperty()
  lastMatchTime: Date;

  // 历史赛季等级（已弃用，未参与任何业务逻辑，保留仅为向后兼容旧文档）
  /** @deprecated 未使用，保留仅为兼容历史数据 */
  @ApiPropertyOptional({ deprecated: true })
  firstSeasonLevel?: number;
  /** @deprecated 未使用，保留仅为兼容历史数据 */
  @ApiPropertyOptional({ deprecated: true })
  secondSeasonLevel?: number;
  /** @deprecated 未使用，保留仅为兼容历史数据 */
  @ApiPropertyOptional({ deprecated: true })
  thirdSeasonLevel?: number;
}
