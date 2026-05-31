import { Injectable } from '@nestjs/common';
import { logger } from 'firebase-functions';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { GameEndGameOptionsDto, GameEndPlayerDto } from '../analytics/dto/game-end-dto';

import { PlayerStatsLifetime } from './entities/player-stats-lifetime.entity';
import {
  STATS_LIFETIME_FIELDS,
  StatsLifetimeField,
  shouldSkipStatsLifetimeForGameOptions,
  toFiniteNumber,
  validateStatContribution,
} from './player-stats-lifetime.constants';

@Injectable()
export class PlayerStatsLifetimeService {
  constructor(
    @InjectRepository(PlayerStatsLifetime)
    private readonly repository: BaseFirestoreRepository<PlayerStatsLifetime>,
  ) {}

  async accumulate(
    steamId: number,
    player: GameEndPlayerDto,
    context: { matchId: string; gameOptions?: GameEndGameOptionsDto },
  ): Promise<void> {
    if (steamId <= 0) {
      return;
    }

    if (shouldSkipStatsLifetimeForGameOptions(context.gameOptions)) {
      logger.warn('game/end: skip statsLifetime by gameOptions', {
        steamId,
        matchId: context.matchId,
        gameOptions: context.gameOptions,
      });
      return;
    }

    const id = steamId.toString();
    const existing = await this.repository.findById(id);

    if (existing) {
      this.applyPlayerStats(existing, player, steamId, context.matchId);
      existing.updatedAt = new Date();
      await this.repository.update(existing);
    } else {
      const created: PlayerStatsLifetime = {
        id,
        kills: 0,
        deaths: 0,
        assists: 0,
        lastHits: 0,
        heroDamage: 0,
        damageTaken: 0,
        healing: 0,
        towerKills: 0,
        totalGoldEarned: 0,
        updatedAt: new Date(),
      };
      this.applyPlayerStats(created, player, steamId, context.matchId);
      await this.repository.create(created);
    }
  }

  async findBySteamId(steamId: number): Promise<PlayerStatsLifetime | null> {
    return await this.repository.findById(steamId.toString());
  }

  private applyPlayerStats(
    stats: PlayerStatsLifetime,
    player: GameEndPlayerDto,
    steamId: number,
    matchId: string,
  ): void {
    for (const field of STATS_LIFETIME_FIELDS) {
      const delta = validateStatContribution(field, player[field]);
      if (delta === null) {
        logger.warn('game/end: invalid statsLifetime contribution, skip field', {
          steamId,
          matchId,
          field,
          rawValue: player[field],
        });
        continue;
      }
      stats[field] = this.safeAdd(stats[field], delta, field, steamId, matchId);
    }
  }

  private safeAdd(
    current: unknown,
    delta: number,
    field: StatsLifetimeField,
    steamId: number,
    matchId: string,
  ): number {
    const currentValue = toFiniteNumber(current);
    if (currentValue === null) {
      logger.warn('game/end: invalid statsLifetime base value, reset to 0', {
        steamId,
        matchId,
        field,
        rawValue: current,
      });
      return delta;
    }
    return currentValue + delta;
  }
}
