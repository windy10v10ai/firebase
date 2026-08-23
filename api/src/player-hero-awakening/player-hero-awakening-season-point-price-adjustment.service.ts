import { Injectable } from '@nestjs/common';
import { logger } from 'firebase-functions';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { PlayerService } from '../player/player.service';

import { PlayerHeroAwakening } from './entities/player-hero-awakening.entity';

const DEFAULT_BATCH_SIZE = 100;
const HISTORICAL_HERO_AWAKENING_SEASON_POINT_COST = 10000;
const HISTORICAL_HERO_AWAKENING_SEASON_POINT_COST_RANDOM = 5000;
const HERO_AWAKENING_SEASON_POINT_COST = 8000;
const HERO_AWAKENING_SEASON_POINT_COST_RANDOM = 4000;

export interface HeroAwakeningSeasonPointPriceAdjustmentResult {
  processedCount: number;
  totalRefundSeasonPoint: number;
}

@Injectable()
export class PlayerHeroAwakeningSeasonPointPriceAdjustmentService {
  constructor(
    @InjectRepository(PlayerHeroAwakening)
    private readonly playerHeroAwakeningRepository: BaseFirestoreRepository<PlayerHeroAwakening>,
    private readonly playerService: PlayerService,
  ) {}

  async runPriceAdjustment(
    batchSize: number = DEFAULT_BATCH_SIZE,
  ): Promise<HeroAwakeningSeasonPointPriceAdjustmentResult> {
    let processedCount = 0;
    let totalRefundSeasonPoint = 0;
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
        const refundSeasonPoint = await this.adjustOne(doc);
        if (refundSeasonPoint > 0) {
          processedCount++;
          totalRefundSeasonPoint += refundSeasonPoint;
        }
      }

      lastSteamId = batch[batch.length - 1].steamId;
    }

    return { processedCount, totalRefundSeasonPoint };
  }

  private async adjustOne(doc: PlayerHeroAwakening): Promise<number> {
    let refundSeasonPoint = 0;
    const awakenings = doc.awakenings.map((awakening) => {
      const adjustedCost = this.resolveAdjustedCost(awakening.usedSeasonPoint);
      if (adjustedCost === undefined) {
        return awakening;
      }

      refundSeasonPoint += (awakening.usedSeasonPoint ?? 0) - adjustedCost;
      return { ...awakening, usedSeasonPoint: adjustedCost };
    });

    if (refundSeasonPoint === 0) {
      return 0;
    }

    await this.playerService.reduceUsedPoint(doc.steamId, {
      usedSeasonPoint: refundSeasonPoint,
      usedMemberPoint: 0,
    });
    doc.awakenings = awakenings;
    await this.playerHeroAwakeningRepository.update(doc);

    logger.log('[Hero Awakening Season Point Price Adjustment] refunded', {
      steamId: doc.steamId,
      refundSeasonPoint,
    });
    return refundSeasonPoint;
  }

  private resolveAdjustedCost(usedSeasonPoint: number | undefined): number | undefined {
    if (usedSeasonPoint === HISTORICAL_HERO_AWAKENING_SEASON_POINT_COST) {
      return HERO_AWAKENING_SEASON_POINT_COST;
    }
    if (usedSeasonPoint === HISTORICAL_HERO_AWAKENING_SEASON_POINT_COST_RANDOM) {
      return HERO_AWAKENING_SEASON_POINT_COST_RANDOM;
    }
    return undefined;
  }
}
