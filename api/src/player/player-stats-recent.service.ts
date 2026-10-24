import { Injectable } from '@nestjs/common';
import { logger } from 'firebase-functions';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { GameEndDto, GameEndPlayerDto, getDotaTimeMsec } from '../analytics/dto/game-end-dto';

import {
  PlayerStatsRecent,
  PlayerStatsRecentArchive,
  PlayerStatsRecentMatch,
} from './entities/player-stats-recent.entity';
import {
  STATS_LIFETIME_FIELDS,
  StatsLifetimeField,
  shouldSkipStatsLifetimeForGameOptions,
  toFiniteNumber,
  validateStatContribution,
} from './player-stats-lifetime.constants';

/** 页面、雷达图与每页历史的场次数 */
export const RECENT_MATCH_LIMIT = 50;

/** 主文档攒到这个数就把最老的一批整页搬进归档：搬运摊到每 50 场一次，归档页写完不再改。一行约 1 KB，100 行距单文档 1 MB 上限仍有十倍余量 */
const ARCHIVE_TRIGGER_COUNT = RECENT_MATCH_LIMIT * 2;

export interface PlayerStatsHistoryPage {
  matches: PlayerStatsRecentMatch[];
  /** 下一次请求带回来的归档页号，没有更早的战绩时为空 */
  nextPage: number | null;
}

/** 有每局上限可校验的那几项，上限与生涯战绩共用 */
type CappedStats = Record<StatsLifetimeField, number>;

@Injectable()
export class PlayerStatsRecentService {
  constructor(
    @InjectRepository(PlayerStatsRecent)
    private readonly repository: BaseFirestoreRepository<PlayerStatsRecent>,
    @InjectRepository(PlayerStatsRecentArchive)
    private readonly archiveRepository: BaseFirestoreRepository<PlayerStatsRecentArchive>,
  ) {}

  /** 把一名玩家这一局的明细插到他的近期战绩最前面，攒满后最老的一批搬进归档 */
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
      const matches = [match, ...(existing.matches ?? [])];
      existing.updatedAt = new Date();
      if (matches.length >= ARCHIVE_TRIGGER_COUNT) {
        await this.archiveOldest(existing, matches);
      } else {
        existing.matches = matches;
        await this.repository.update(existing);
      }
    } else {
      await this.repository.create({ id, matches: [match], updatedAt: new Date() });
    }
  }

  async findBySteamId(steamId: number): Promise<PlayerStatsRecent | null> {
    return await this.repository.findById(steamId.toString());
  }

  /**
   * 取页面展示的前 50 场之后的更早战绩。不带 page 从主文档里 50 场以后的部分开始，带 page 取该归档页；
   * 一次不足 50 场就顺势再补一页归档，避免主文档里只剩几场时前端拿到一小段。
   */
  async findHistory(steamId: number, page?: number): Promise<PlayerStatsHistoryPage> {
    const stats = await this.findBySteamId(steamId);
    const archivedPages = stats?.archivedPages ?? 0;
    const matches = page === undefined ? (stats?.matches ?? []).slice(RECENT_MATCH_LIMIT) : [];
    let cursor = page === undefined ? archivedPages : Math.min(page, archivedPages);

    while (matches.length < RECENT_MATCH_LIMIT && cursor >= 1) {
      const archive = await this.archiveRepository.findById(`${steamId}_${cursor}`);
      matches.push(...(archive?.matches ?? []));
      cursor -= 1;
    }
    return { matches, nextPage: cursor >= 1 ? cursor : null };
  }

  /** 先写归档页再改主文档：中途失败时主文档仍是满的，下一局重新搬同一批，同号页覆盖写入即可 */
  private async archiveOldest(
    existing: PlayerStatsRecent,
    matches: PlayerStatsRecentMatch[],
  ): Promise<void> {
    const page = (existing.archivedPages ?? 0) + 1;
    const archive = { id: `${existing.id}_${page}`, matches: matches.slice(RECENT_MATCH_LIMIT) };
    if (await this.archiveRepository.findById(archive.id)) {
      await this.archiveRepository.update(archive);
    } else {
      await this.archiveRepository.create(archive);
    }

    existing.matches = matches.slice(0, RECENT_MATCH_LIMIT);
    existing.archivedPages = page;
    await this.repository.update(existing);
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
      durationSec: Math.round(this.numberOrZero(getDotaTimeMsec(gameEnd)) / 1000),
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
