import { Injectable } from '@nestjs/common';
import { logger } from 'firebase-functions';

import { PlayerService } from '../player/player.service';

import { PlayerPropertyService } from './player-property.service';

export interface PlayerPropertyResetResult {
  processedCount: number;
}

@Injectable()
export class PlayerPropertyResetService {
  constructor(
    private readonly playerService: PlayerService,
    private readonly playerPropertyService: PlayerPropertyService,
  ) {}

  /**
   * 清空全服所有加过点的玩家的属性加点，并把已用等级归零，可重复执行。
   */
  async resetAll(): Promise<PlayerPropertyResetResult> {
    const players = await this.playerService.findAllWithUsedLevelGreaterThanZero();
    const total = players.length;
    logger.log('[Player Property Reset] start', { total });

    let processed = 0;
    for (const player of players) {
      const steamId = Number(player.id);
      await this.playerPropertyService.deleteBySteamId(steamId);
      processed++;
      logger.log('[Player Property Reset] reset', {
        steamId,
        previousUsedLevel: player.usedLevel,
        progress: `${processed}/${total}`,
      });
    }

    logger.log('[Player Property Reset] done', { processedCount: processed });
    return { processedCount: processed };
  }
}
