import { Injectable } from '@nestjs/common';
import { logger } from 'firebase-functions';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { PlayerService } from '../player/player.service';

import { PlayerHeroAwakening } from './entities/player-hero-awakening.entity';

const DEFAULT_BATCH_SIZE = 100;

export interface HeroAwakeningCompensationResult {
  processedCount: number;
}

@Injectable()
export class PlayerHeroAwakeningCompensationService {
  constructor(
    @InjectRepository(PlayerHeroAwakening)
    private readonly playerHeroAwakeningRepository: BaseFirestoreRepository<PlayerHeroAwakening>,
    private readonly playerService: PlayerService,
  ) {}

  // TODO: 一次性迁移，随机觉醒上线执行完后删除本 service、admin 端点及相关 module 注册。
  /**
   * 把所有已花费的觉醒积分（季卡/会员）全额退回，
   * 并清空该玩家的觉醒状态，让所有玩家在新价格体系下重新选择。
   *
   * 用 PlayerHeroAwakening 文档是否存在代替单独的"已处理"标记位——
   * 处理完即删除该文档，重跑时查询天然不会再选中已处理的玩家。
   */
  async runCompensation(
    batchSize: number = DEFAULT_BATCH_SIZE,
  ): Promise<HeroAwakeningCompensationResult> {
    let processedCount = 0;
    let lastSteamId: number | undefined;

    while (true) {
      let query = this.playerHeroAwakeningRepository.orderByAscending('steamId').limit(batchSize);
      if (lastSteamId !== undefined) {
        query = query.whereGreaterThan('steamId', lastSteamId);
      }
      const batch = await query.find();
      if (batch.length === 0) {
        break;
      }

      for (const doc of batch) {
        await this.compensateOne(doc, ++processedCount);
      }

      lastSteamId = batch[batch.length - 1].steamId;
    }

    return { processedCount };
  }

  private async compensateOne(doc: PlayerHeroAwakening, sequence: number): Promise<void> {
    const refundSeasonPoint = doc.awakenings.reduce((sum, a) => sum + (a.usedSeasonPoint ?? 0), 0);
    const refundMemberPoint = doc.awakenings.reduce((sum, a) => sum + (a.usedMemberPoint ?? 0), 0);

    const playerBefore = await this.playerService.findBySteamId(doc.steamId);
    const useableSeasonPointBefore =
      (playerBefore?.seasonPointTotal ?? 0) - (playerBefore?.usedSeasonPoint ?? 0);

    await this.playerService.reduceUsedPoint(doc.steamId, {
      usedSeasonPoint: refundSeasonPoint,
      usedMemberPoint: refundMemberPoint,
    });

    await this.playerHeroAwakeningRepository.delete(doc.id);

    const playerAfter = await this.playerService.findBySteamId(doc.steamId);
    const useableSeasonPointAfter =
      (playerAfter?.seasonPointTotal ?? 0) - (playerAfter?.usedSeasonPoint ?? 0);

    logger.log('[Hero Awakening Compensation] refunded', {
      sequence,
      steamId: doc.steamId,
      refundSeasonPoint,
      refundMemberPoint,
      removedHeroes: doc.awakenings.map((a) => a.heroName),
      useableSeasonPointBefore,
      useableSeasonPointAfter,
    });
  }
}
