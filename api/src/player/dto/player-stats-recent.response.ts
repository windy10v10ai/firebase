import { ApiProperty } from '@nestjs/swagger';

import { PlayerStatsRecentMatch } from '../entities/player-stats-recent.entity';

export class PlayerStatsRecentResponse {
  /** 新场次在前 */
  @ApiProperty({ type: [PlayerStatsRecentMatch] })
  matches: PlayerStatsRecentMatch[];
}
