import { Injectable } from '@nestjs/common';
import { logger } from 'firebase-functions';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { GameEndDto, GameEndPlayerDto } from '../analytics/dto/game-end-dto';
import { DailyTaskService } from '../daily-task/services/daily-task.service';
import { PlayerService } from '../player/player.service';

import { LocalRateLimit } from './entities/local-rate-limit.entity';

const COOLDOWN_MINUTES = 20;
const COOLDOWN_MS = COOLDOWN_MINUTES * 60 * 1000;
const DAILY_POINT_CAP = 1000;
const MIN_MATCH_COUNT = 1;
const UNKNOWN_IP = 'unknown';

// 检查结果：ok=false 时 reason 说明原因；ok=true 时 current/dailyPointsSoFar
// 是 commitPlayerSettlement 落盘要用的数据。不管 ok 是什么，两个字段都在，
// 不需要用类型系统去区分两种形状。
interface PlayerCheck {
  steamId: number;
  battlePoints: number;
  ok: boolean;
  reason?: string;
  current: LocalRateLimit | null;
  dailyPointsSoFar: number;
}

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
export class LocalHostService {
  constructor(
    @InjectRepository(LocalRateLimit)
    private readonly rateLimitRepository: BaseFirestoreRepository<LocalRateLimit>,
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

    const qualifiedPlayers = gameEnd.players.filter((player) => player.steamId > 0);
    const checks = await Promise.all(
      qualifiedPlayers.map((player) => this.checkPlayerLimit(player, gameEnd.matchId)),
    );

    // 只要有一个玩家没通过检查（含同一 matchId 重试），整场比赛都不写分、
    // 不记录每日任务——不单独跳过那一个玩家，避免部分发放/部分记录。
    if (checks.some((check) => !check.ok)) {
      for (const check of checks) {
        if (!check.ok) {
          logger.warn('game/end/local: rejected', {
            steamId: check.steamId,
            battlePoints: check.battlePoints,
            reason: check.reason,
          });
        }
      }
      logger.warn('game/end/local: request rejected, no points or daily task recorded', {
        matchId: gameEnd.matchId,
      });
      return;
    }

    // 走到这里说明每个 check 都是 ok，可以放心提交。
    await Promise.all(checks.map((check) => this.commitPlayerSettlement(check, gameEnd)));

    await this.dailyTaskService.recordGameEnd(gameEnd.players);
  }

  private async checkAndTouchIpLimit(ip: string, matchId: string): Promise<boolean> {
    if (ip === UNKNOWN_IP) {
      // 拿不到真实客户端 IP 时不做限流，避免把不同来源的请求错误地合并限流。
      return true;
    }

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

      const next: LocalRateLimit = {
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

  // 只读检查，不写任何数据：同一 matchId 重试直接算失败；否则依次检查玩家
  // 存在性/matchCount、冷却、当日上限。
  private async checkPlayerLimit(player: GameEndPlayerDto, matchId: string): Promise<PlayerCheck> {
    const steamId = player.steamId;
    const battlePoints = this.playerService.normalizeBattlePoints(player.battlePoints);
    const current = await this.rateLimitRepository.findById(playerRateLimitId(steamId));
    const reject = (reason: string): PlayerCheck => ({
      steamId,
      battlePoints,
      ok: false,
      reason,
      current,
      dailyPointsSoFar: 0,
    });

    if (current?.lastRequestMatchId === matchId) {
      return reject('duplicate matchId');
    }

    const existingPlayer = await this.playerService.findBySteamId(steamId);
    if (!existingPlayer) {
      return reject('player not found');
    }
    if (existingPlayer.matchCount <= MIN_MATCH_COUNT) {
      return reject('matchCount too low');
    }
    if (current) {
      const elapsedMs = Date.now() - current.lastRequestAt.getTime();
      if (elapsedMs < COOLDOWN_MS) {
        return reject('cooldown');
      }
    }

    const today = getUtcMidnight(new Date());
    const dailyPointsSoFar =
      current?.dailyPointsDate && current.dailyPointsDate.getTime() === today.getTime()
        ? (current.dailyPointsTotal ?? 0)
        : 0;
    if (dailyPointsSoFar + battlePoints > DAILY_POINT_CAP) {
      return reject('daily cap exceeded');
    }

    return { steamId, battlePoints, ok: true, current, dailyPointsSoFar };
  }

  // 写入 rate-limit 文档 + 加分，只在 checkPlayerLimit 返回 ok 时调用。
  private async commitPlayerSettlement(check: PlayerCheck, gameEnd: GameEndDto): Promise<void> {
    const next: LocalRateLimit = {
      id: playerRateLimitId(check.steamId),
      lastRequestAt: new Date(),
      lastRequestMatchId: gameEnd.matchId,
      dailyPointsDate: getUtcMidnight(new Date()),
      dailyPointsTotal: check.dailyPointsSoFar + check.battlePoints,
    };
    if (check.current) {
      await this.rateLimitRepository.update(next);
    } else {
      await this.rateLimitRepository.create(next);
    }

    await this.playerService.addLocalSeasonPoints(check.steamId, check.battlePoints);
    logger.info('game/end/local: settled', {
      matchId: gameEnd.matchId,
      steamId: check.steamId,
      battlePoints: check.battlePoints,
      version: gameEnd.version,
      serverType: 'LOCAL',
    });
  }
}
