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

  async settle(gameEnd: GameEndDto): Promise<void> {
    // 顺序检查每个合格玩家；只要有一个没通过（含同一 matchId 重试），整场
    // 比赛立刻拒绝，不写分、不记录每日任务——不单独跳过那一个玩家，也不用
    // 等其余玩家都检查完。
    const qualifiedPlayers = gameEnd.players.filter((player) => player.steamId > 0);
    const checks: PlayerCheck[] = [];
    for (const player of qualifiedPlayers) {
      const check = await this.checkPlayerLimit(player, gameEnd.matchId);
      if (!check.ok) {
        logger.warn('game/end/local: rejected, no points or daily task recorded for this match', {
          matchId: gameEnd.matchId,
          steamId: check.steamId,
          battlePoints: check.battlePoints,
          reason: check.reason,
        });
        return;
      }
      checks.push(check);
    }

    for (const check of checks) {
      await this.commitPlayerSettlement(check, gameEnd);
    }

    await this.dailyTaskService.recordGameEnd(gameEnd.players);
  }

  // 只读检查，不写任何数据：同一 matchId 重试直接算失败；否则依次检查玩家
  // 存在性/matchCount、冷却、当日上限。
  private async checkPlayerLimit(player: GameEndPlayerDto, matchId: string): Promise<PlayerCheck> {
    const steamId = player.steamId;
    const battlePoints = this.playerService.normalizeBattlePoints(player.battlePoints);
    const current = await this.rateLimitRepository.findById(steamId.toString());
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
      id: check.steamId.toString(),
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
