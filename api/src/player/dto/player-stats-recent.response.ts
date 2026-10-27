import { ApiProperty } from '@nestjs/swagger';

import { PlayerStatsRecentMatch } from '../entities/player-stats-recent.entity';

export class PlayerStatsRecentResponse {
  /** 新场次在前 */
  @ApiProperty({ type: [PlayerStatsRecentMatch] })
  matches: PlayerStatsRecentMatch[];
  /** 展示的 50 场之后是否还有更早的战绩 */
  @ApiProperty()
  hasMore: boolean;
}

export class PlayerStatsHistoryResponse {
  /** 新场次在前 */
  @ApiProperty({ type: [PlayerStatsRecentMatch] })
  matches: PlayerStatsRecentMatch[];
  /** 下一次请求带回来的页号，没有更早的战绩时为空 */
  @ApiProperty({ type: Number, nullable: true })
  nextPage: number | null;
}
