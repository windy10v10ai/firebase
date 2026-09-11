import { BadRequestException, Injectable } from '@nestjs/common';
import { logger } from 'firebase-functions';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { GameEndDto, GameEndPlayerDto } from '../analytics/dto/game-end-dto';
import { DailyTaskService } from '../daily-task/services/daily-task.service';
import { PlayerService } from '../player/player.service';

import { LocalRateLimit } from './entities/local-rate-limit.entity';

const COOLDOWN_MINUTES = 5;
export const COOLDOWN_MS = COOLDOWN_MINUTES * 60 * 1000;
const DAILY_POINT_CAP = 2000;
const LOCAL_MEMBER_POINT_SINGLE_CAP = 50;
const LOCAL_MEMBER_POINT_DAILY_CAP = 1000;
const LOCAL_DAILY_ORDER_CAP = 10;

// 检查结果：ok=false 时 reason 说明原因；ok=true 时 current/counters
// 是 savePlayerGameEnd 落盘要用的数据。不管 ok 是什么，两个字段都在，
// 不需要用类型系统去区分两种形状。
interface PlayerCheck {
  player: GameEndPlayerDto;
  steamId: number;
  battlePoints: number;
  ok: boolean;
  reason?: string;
  current: LocalRateLimit | null;
  counters: DailyCounters;
  today: Date;
}

function getUtcMidnight(date: Date): Date {
  const truncated = new Date(date);
  truncated.setUTCHours(0, 0, 0, 0);
  return truncated;
}

interface DailyCounters {
  earnedSeasonPoint: number;
  usedMemberPoint: number;
  createdOrderCount: number;
}

// 三个计数共用 dailyDate，日期对不上时必须一起归零：只更新其中一个并把日期
// 改成今天，会把另外两个昨天的数字算进今天
function getDailyCounters(current: LocalRateLimit | null, today: Date): DailyCounters {
  if (!current?.dailyDate || current.dailyDate.getTime() !== today.getTime()) {
    return { earnedSeasonPoint: 0, usedMemberPoint: 0, createdOrderCount: 0 };
  }
  return {
    earnedSeasonPoint: current.dailyEarnedSeasonPoint ?? 0,
    usedMemberPoint: current.dailyUsedMemberPoint ?? 0,
    createdOrderCount: current.dailyCreatedOrderCount ?? 0,
  };
}

@Injectable()
export class LocalHostService {
  constructor(
    @InjectRepository(LocalRateLimit)
    private readonly rateLimitRepository: BaseFirestoreRepository<LocalRateLimit>,
    private readonly playerService: PlayerService,
    private readonly dailyTaskService: DailyTaskService,
  ) {}

  /** 记录本地对局，返回这场比赛是否计入。 */
  async recordGameEnd(gameEnd: GameEndDto): Promise<boolean> {
    // 顺序检查每个合格玩家；只要有一个没通过（含同一 matchId 重试），整场
    // 比赛立刻拒绝，不写分、不记录每日任务——不单独跳过那一个玩家，也不用
    // 等其余玩家都检查完。
    const qualifiedPlayers = gameEnd.players.filter((player) => player.steamId > 0);
    const checks: PlayerCheck[] = [];
    for (const player of qualifiedPlayers) {
      const check = await this.checkPlayerLimit(player);
      if (!check.ok) {
        logger.warn('game/end/local: rejected, no points or daily task recorded for this match', {
          matchId: gameEnd.matchId,
          steamId: check.steamId,
          battlePoints: check.battlePoints,
          reason: check.reason,
        });
        return false;
      }
      checks.push(check);
    }

    for (const check of checks) {
      await this.savePlayerGameEnd(check, gameEnd);
    }

    await this.dailyTaskService.recordGameEnd(gameEnd.players);
    return true;
  }

  /** 本地来源消耗会员积分前的限额检查，超限抛 400。 */
  async assertMemberPointWithinLimit(steamId: number, memberPoint: number): Promise<void> {
    if (memberPoint > LOCAL_MEMBER_POINT_SINGLE_CAP) {
      logger.warn('local: member point rejected', { steamId, memberPoint, reason: 'single cap' });
      throw new BadRequestException();
    }

    const current = await this.rateLimitRepository.findById(steamId.toString());
    const counters = getDailyCounters(current, getUtcMidnight(new Date()));
    if (counters.usedMemberPoint + memberPoint > LOCAL_MEMBER_POINT_DAILY_CAP) {
      logger.warn('local: member point rejected', { steamId, memberPoint, reason: 'daily cap' });
      throw new BadRequestException();
    }
  }

  /** 本地来源消耗会员积分成功后累加当日计数。 */
  async recordMemberPointUsage(
    steamId: number,
    memberPoint: number,
    reason: string,
  ): Promise<void> {
    const today = getUtcMidnight(new Date());
    const current = await this.rateLimitRepository.findById(steamId.toString());
    const counters = getDailyCounters(current, today);
    counters.usedMemberPoint += memberPoint;
    await this.saveDailyCounters(steamId, current, today, counters);

    logger.info('local: member point used', { steamId, memberPoint, reason });
  }

  // 检查和记账是两次分开的读写，中间有空隙，并发下最多多放一次，不值得为此上事务
  /** 本地来源创建支付宝订单前的次数检查，超限抛 400。 */
  async assertOrderWithinLimit(steamId: number): Promise<void> {
    const current = await this.rateLimitRepository.findById(steamId.toString());
    const counters = getDailyCounters(current, getUtcMidnight(new Date()));
    if (counters.createdOrderCount >= LOCAL_DAILY_ORDER_CAP) {
      logger.warn('local: alipay order rejected', { steamId, reason: 'daily order cap' });
      throw new BadRequestException();
    }
  }

  /** 本地来源创建支付宝订单成功后累加当日次数。 */
  async recordOrder(steamId: number): Promise<void> {
    const today = getUtcMidnight(new Date());
    const current = await this.rateLimitRepository.findById(steamId.toString());
    const counters = getDailyCounters(current, today);
    counters.createdOrderCount += 1;
    await this.saveDailyCounters(steamId, current, today, counters);
  }

  /** 支付成功后清零当日下单次数，让付过钱的玩家可以继续购买。 */
  async resetOrderCount(steamId: number): Promise<void> {
    const current = await this.rateLimitRepository.findById(steamId.toString());
    if (!current) {
      return;
    }

    const today = getUtcMidnight(new Date());
    const counters = getDailyCounters(current, today);
    counters.createdOrderCount = 0;
    await this.saveDailyCounters(steamId, current, today, counters);
  }

  // 只读检查，不写任何数据：依次检查玩家存在性/matchCount、冷却、当日上限。
  // 不比对 matchId 去重——控制台启动的对局引擎给的 matchId 恒为 "0"，会把
  // 不同对局误判为重放；冷却窗口已经足够防止短时间内重复结算。
  private async checkPlayerLimit(player: GameEndPlayerDto): Promise<PlayerCheck> {
    const steamId = player.steamId;
    const battlePoints = this.playerService.normalizeBattlePoints(player.battlePoints);
    const current = await this.rateLimitRepository.findById(steamId.toString());
    // 多人对局是先查完所有玩家再统一写回，两步之间可能跨过 UTC 零点；
    // today 由 check 算定并透传给 commit，避免写回时日期已经翻页，
    // 却带着查询时算出的旧一天的计数
    const today = getUtcMidnight(new Date());
    const reject = (reason: string): PlayerCheck => ({
      player,
      steamId,
      battlePoints,
      ok: false,
      reason,
      current,
      today,
      counters: { earnedSeasonPoint: 0, usedMemberPoint: 0, createdOrderCount: 0 },
    });

    // 唯一的准入条件是玩家已由开局接口创建；伪造的 steamId 走不到开局，也就结算不了
    const existingPlayer = await this.playerService.findBySteamId(steamId);
    if (!existingPlayer) {
      return reject('player not found');
    }
    if (current?.lastRequestAt) {
      const elapsedMs = Date.now() - current.lastRequestAt.getTime();
      if (elapsedMs < COOLDOWN_MS) {
        return reject('cooldown');
      }
    }

    const counters = getDailyCounters(current, today);
    if (counters.earnedSeasonPoint + battlePoints > DAILY_POINT_CAP) {
      return reject('daily cap exceeded');
    }

    return { player, steamId, battlePoints, ok: true, current, counters, today };
  }

  // 唯一的写入口，要求调用方交出完整的三个计数：只更新其中一个再把 dailyDate 推到
  // 今天，会让另外两个昨天的值变成今天的
  private async saveDailyCounters(
    steamId: number,
    current: LocalRateLimit | null,
    today: Date,
    counters: DailyCounters,
    extra: Partial<LocalRateLimit> = {},
  ): Promise<void> {
    const next = {
      ...(current ?? { id: steamId.toString() }),
      ...extra,
      dailyDate: today,
      dailyEarnedSeasonPoint: counters.earnedSeasonPoint,
      dailyUsedMemberPoint: counters.usedMemberPoint,
      dailyCreatedOrderCount: counters.createdOrderCount,
    } as LocalRateLimit;
    if (current) {
      await this.rateLimitRepository.update(next);
    } else {
      await this.rateLimitRepository.create(next);
    }
  }

  // 写入限流文档 + 加分与战绩，只在 checkPlayerLimit 返回 ok 时调用。
  private async savePlayerGameEnd(check: PlayerCheck, gameEnd: GameEndDto): Promise<void> {
    const counters = { ...check.counters };
    counters.earnedSeasonPoint += check.battlePoints;
    await this.saveDailyCounters(check.steamId, check.current, check.today, counters, {
      lastRequestAt: new Date(),
      lastRequestMatchId: gameEnd.matchId,
    });

    await this.playerService.upsertLocalGameEnd(
      check.steamId,
      check.player.teamId === gameEnd.winnerTeamId,
      check.battlePoints,
      check.player.isDisconnected,
    );
    logger.info('game/end/local: recorded', {
      matchId: gameEnd.matchId,
      steamId: check.steamId,
      battlePoints: check.battlePoints,
      version: gameEnd.version,
      serverType: 'LOCAL',
    });
  }
}
