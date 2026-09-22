import { Injectable } from '@nestjs/common';
import { logger } from 'firebase-functions';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { GameEndDto, GameEndPlayerDto } from '../analytics/dto/game-end-dto';

import { PlayerStatsRecent, PlayerStatsRecentMatch } from './entities/player-stats-recent.entity';
import {
  STATS_LIFETIME_FIELDS,
  StatsLifetimeField,
  shouldSkipStatsLifetimeForGameOptions,
  toFiniteNumber,
  validateStatContribution,
} from './player-stats-lifetime.constants';

/** 一行约 1 KB，50 行距 Firestore 单文档 1 MB 上限有二十倍余量 */
export const RECENT_MATCH_LIMIT = 50;

/** 有每局上限可校验的那几项，上限与生涯战绩共用 */
type CappedStats = Record<StatsLifetimeField, number>;

@Injectable()
export class PlayerStatsRecentService {
  constructor(
    @InjectRepository(PlayerStatsRecent)
    private readonly repository: BaseFirestoreRepository<PlayerStatsRecent>,
  ) {}

  /** 把一名玩家这一局的明细插到他的近期战绩最前面，超出上限的从尾部丢弃 */
  async record(player: GameEndPlayerDto, gameEnd: GameEndDto): Promise<void> {
    const steamId = player.steamId;
    if (steamId <= 0) {
      return;
    }
    // 与生涯战绩同一个口径，两份数据的入口不一致会让人无法解释为什么这局在战绩里有、在累计里没有。
    // 跳过的日志由生涯战绩那边打，这里不重复
    if (shouldSkipStatsLifetimeForGameOptions(gameEnd.gameOptions)) {
      return;
    }

    const match = this.buildMatch(player, gameEnd);
    const id = steamId.toString();
    const existing = await this.repository.findById(id);

    if (existing) {
      existing.matches = [match, ...(existing.matches ?? [])].slice(0, RECENT_MATCH_LIMIT);
      existing.updatedAt = new Date();
      await this.repository.update(existing);
    } else {
      await this.repository.create({ id, matches: [match], updatedAt: new Date() });
    }
  }

  async findBySteamId(steamId: number): Promise<PlayerStatsRecent | null> {
    return await this.repository.findById(steamId.toString());
  }

  private buildMatch(player: GameEndPlayerDto, gameEnd: GameEndDto): PlayerStatsRecentMatch {
    const steamId = player.steamId;
    const options = gameEnd.gameOptions;

    return {
      matchId: gameEnd.matchId,
      // 游戏端不发时间戳，用服务端收到结算的时间
      endedAt: new Date(),
      version: gameEnd.version,
      difficulty: this.numberOrZero(gameEnd.difficulty),
      durationSec: Math.round(this.numberOrZero(gameEnd.gameTimeMsec) / 1000),
      win: player.teamId === gameEnd.winnerTeamId,
      multiplierRadiant: this.numberOrZero(options?.multiplierRadiant),
      multiplierDire: this.numberOrZero(options?.multiplierDire),
      towerPowerPct: this.numberOrZero(options?.towerPowerPct),

      heroName: player.heroName,
      level: this.numberOrZero(player.level),
      awaken: this.numberOrZero(player.awaken),
      isDisconnected: player.isDisconnected === true,

      ...this.buildCappedStats(player, steamId, gameEnd.matchId),
      stuns: this.numberOrZero(player.stuns),
      roshanKills: this.numberOrZero(player.roshanKills),
      battlePoints: this.numberOrZero(player.battlePoints),

      strength: player.strength,
      agility: player.agility,
      intellect: player.intellect,
      items: player.items,
      neutralItem: player.neutralItem,
      neutralPassiveItem: player.neutralPassiveItem,
      abilities: player.abilities,
    };
  }

  /** 超过每局上限的字段落回 0，整场仍然记录：一个坏数值不该让这局在战绩里凭空消失 */
  private buildCappedStats(
    player: GameEndPlayerDto,
    steamId: number,
    matchId: string,
  ): CappedStats {
    const stats = {} as CappedStats;
    for (const field of STATS_LIFETIME_FIELDS) {
      const value = validateStatContribution(field, player[field]);
      if (value === null) {
        logger.warn('game/end: invalid statsRecent value, reset to 0', {
          steamId,
          matchId,
          field,
          rawValue: player[field],
        });
      }
      stats[field] = value ?? 0;
    }
    return stats;
  }

  private numberOrZero(value: unknown): number {
    return toFiniteNumber(value) ?? 0;
  }
}
