import { ApiProperty } from '@nestjs/swagger';

/** 各项是近期各局在同难度玩家中百分位的平均，0–100，越大越好；合并成六边形的哪个角由网站决定。 */
export class PlayerStatsRadar {
  @ApiProperty()
  damage: number;
  @ApiProperty()
  gold: number;
  @ApiProperty()
  participation: number;
  @ApiProperty()
  push: number;
  /** 已反过来算，死得越少越高 */
  @ApiProperty()
  deaths: number;
  @ApiProperty()
  tank: number;
  /** 没有治疗的局记 0，有治疗的局只在有治疗的局里排名；各局平均后放大，封顶 100 */
  @ApiProperty()
  healing: number;
  @ApiProperty()
  assists: number;
  @ApiProperty()
  stuns: number;
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
