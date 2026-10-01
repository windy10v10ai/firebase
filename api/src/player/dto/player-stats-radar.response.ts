import { ApiProperty } from '@nestjs/swagger';

export class PlayerStatsRadar {
  /** 六项的平均 */
  @ApiProperty()
  score: number;
  /** 以下各项是在同难度玩家中的百分位，0–100，50 为中位 */
  @ApiProperty()
  damage: number;
  @ApiProperty()
  gold: number;
  @ApiProperty()
  participation: number;
  @ApiProperty()
  survival: number;
  @ApiProperty()
  tank: number;
  @ApiProperty()
  push: number;
}

export class PlayerStatsRadarResponse {
  /** 近期场次里能和基准比较的局数 */
  @ApiProperty()
  matchCount: number;
  @ApiProperty()
  minMatchCount: number;
  /** 局数不够或还没有基准时为 null */
  @ApiProperty({ type: PlayerStatsRadar, nullable: true })
  radar: PlayerStatsRadar | null;
}
