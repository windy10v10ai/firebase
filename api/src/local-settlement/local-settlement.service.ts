import { Injectable } from '@nestjs/common';
import { logger } from 'firebase-functions';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { GameEndDto, GameEndPlayerDto } from '../analytics/dto/game-end-dto';
import { DailyTaskService } from '../daily-task/services/daily-task.service';
import { PlayerService } from '../player/player.service';

import { LocalSettlementRateLimit } from './entities/local-settlement-rate-limit.entity';

const COOLDOWN_MINUTES = 20;
const COOLDOWN_MS = COOLDOWN_MINUTES * 60 * 1000;
const DAILY_POINT_CAP = 1000;
const MIN_MATCH_COUNT = 10;

type PlayerSettleOutcome =
  | { status: 'accepted' }
  | { status: 'duplicate' }
  | { status: 'rejected'; reason: string };

function playerRateLimitId(steamId: number): string {
  return `player:${steamId}`;
}

function ipRateLimitId(ip: string): string {
  return `ip:${ip}`;
}

function getUtcMidnight(date: Date): Date {
  const truncated = new Date(date);
  truncated.setUTCHours(0, 0, 0, 0);
  return truncated;
}

@Injectable()
export class LocalSettlementService {
  constructor(
    @InjectRepository(LocalSettlementRateLimit)
    private readonly rateLimitRepository: BaseFirestoreRepository<LocalSettlementRateLimit>,
    private readonly playerService: PlayerService,
    private readonly dailyTaskService: DailyTaskService,
  ) {}

  async settle(gameEnd: GameEndDto, clientIp: string): Promise<void> {
    const ipAllowed = await this.checkAndTouchIpLimit(clientIp, gameEnd.matchId);
    if (!ipAllowed) {
      logger.warn('game/end/local: rejected by ip rate limit', {
        ip: clientIp,
        matchId: gameEnd.matchId,
      });
      return;
    }

    await Promise.all(gameEnd.players.map((player) => this.settlePlayer(player, gameEnd)));

    await this.dailyTaskService.recordGameEnd(gameEnd.players);
  }

  private async checkAndTouchIpLimit(ip: string, matchId: string): Promise<boolean> {
    const id = ipRateLimitId(ip);
    const now = new Date();

    return this.rateLimitRepository.runTransaction(async (transaction) => {
      const current = await transaction.findById(id);
      if (current && current.lastRequestMatchId !== matchId) {
        const elapsedMs = now.getTime() - current.lastRequestAt.getTime();
        if (elapsedMs < COOLDOWN_MS) {
          return false;
        }
      }

      const next: LocalSettlementRateLimit = {
        id,
        lastRequestAt: now,
        lastRequestMatchId: matchId,
      };
      if (current) {
        await transaction.update(next);
      } else {
        await transaction.create(next);
      }
      return true;
    });
  }

  private async settlePlayer(player: GameEndPlayerDto, gameEnd: GameEndDto): Promise<void> {
    if (player.steamId <= 0) {
      return;
    }

    const battlePoints = this.playerService.normalizeBattlePoints(player.battlePoints);
    const outcome = await this.checkAndTouchPlayerLimit(
      player.steamId,
      gameEnd.matchId,
      battlePoints,
    );

    if (outcome.status === 'rejected') {
      logger.warn('game/end/local: rejected', {
        steamId: player.steamId,
        battlePoints,
        reason: outcome.reason,
      });
      return;
    }
    if (outcome.status === 'duplicate') {
      logger.info('game/end/local: duplicate request, already settled', {
        steamId: player.steamId,
        matchId: gameEnd.matchId,
      });
      return;
    }

    await this.playerService.addLocalSeasonPoints(player.steamId, battlePoints);
    logger.info('game/end/local: settled', {
      matchId: gameEnd.matchId,
      steamId: player.steamId,
      battlePoints,
      version: gameEnd.version,
      serverType: 'LOCAL',
    });
  }

  private async checkAndTouchPlayerLimit(
    steamId: number,
    matchId: string,
    battlePoints: number,
  ): Promise<PlayerSettleOutcome> {
    const id = playerRateLimitId(steamId);
    const now = new Date();

    return this.rateLimitRepository.runTransaction(async (transaction) => {
      const current = await transaction.findById(id);
      if (current?.lastRequestMatchId === matchId) {
        return { status: 'duplicate' };
      }

      const existingPlayer = await this.playerService.findBySteamId(steamId);
      if (!existingPlayer) {
        return { status: 'rejected', reason: 'player not found' };
      }
      if (existingPlayer.matchCount <= MIN_MATCH_COUNT) {
        return { status: 'rejected', reason: 'matchCount too low' };
      }

      if (current) {
        const elapsedMs = now.getTime() - current.lastRequestAt.getTime();
        if (elapsedMs < COOLDOWN_MS) {
          return { status: 'rejected', reason: 'cooldown' };
        }
      }

      const today = getUtcMidnight(now);
      const dailyPointsSoFar =
        current?.dailyPointsDate && current.dailyPointsDate.getTime() === today.getTime()
          ? (current.dailyPointsTotal ?? 0)
          : 0;
      if (dailyPointsSoFar + battlePoints > DAILY_POINT_CAP) {
        return { status: 'rejected', reason: 'daily cap exceeded' };
      }

      const next: LocalSettlementRateLimit = {
        id,
        lastRequestAt: now,
        lastRequestMatchId: matchId,
        dailyPointsDate: today,
        dailyPointsTotal: dailyPointsSoFar + battlePoints,
      };
      if (current) {
        await transaction.update(next);
      } else {
        await transaction.create(next);
      }
      return { status: 'accepted' };
    });
  }
}
