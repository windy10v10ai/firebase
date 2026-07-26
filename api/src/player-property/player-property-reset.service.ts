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
   * 找出所有 usedLevel > 0 的玩家，对每个玩家执行 deleteBySteamId
   *（删除 PlayerProperty 文档 + 将 player.usedLevel 重置为 0），可重复执行。
   * 供运维在需要批量重置玩家属性加点时调用（例如直接操作数据后忘记同步 usedLevel）。
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
