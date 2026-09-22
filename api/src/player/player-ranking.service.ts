import { Injectable, NotFoundException } from '@nestjs/common';
import { BaseFirestoreRepository } from 'fireorm';
import { FireormService, InjectRepository } from 'nestjs-fireorm';

import { SteamProfileApiService } from '../steam-profile/steam-profile.api.service';
import { getUtcDayId } from '../util/date';

import { PlayerRankDto, PlayerRankingDto } from './dto/player-ranking.dto';
import { PlayerRanking, RankedPlayer } from './entities/player-ranking.entity';
import { Player } from './entities/player.entity';

const RANKING_SIZE = 500;
// 计数按扫过的索引条目计费，每 1000 条一次读取；封顶让单次查询最多 10 次读取
const RANK_COUNT_LIMIT = 10000;
const PLAYER_COLLECTION = 'Players';
const EXCLUDED_STEAM_IDS = ['424859328', '869192295', '338807313', '120461913'];

@Injectable()
export class PlayerRankingService {
  constructor(
    @InjectRepository(Player)
    private readonly playerRepository: BaseFirestoreRepository<Player>,
    @InjectRepository(PlayerRanking)
    private readonly playerRankingRepository: BaseFirestoreRepository<PlayerRanking>,
    private readonly steamProfileApiService: SteamProfileApiService,
    private readonly fireormService: FireormService,
  ) {}

  /** 取当天的勇士积分榜，当天第一次请求时生成快照 */
  async getRanking(): Promise<PlayerRankingDto> {
    const id = getUtcDayId();
    const stored = await this.playerRankingRepository.findById(id);
    const players = stored?.players ?? (await this.calculateRanking(id, Boolean(stored)));
    return { date: id, players };
  }

  /** 按累计勇士积分算玩家的实时名次 */
  async getPlayerRank(steamId: string): Promise<PlayerRankDto> {
    const player = await this.playerRepository.findById(steamId);
    if (!player) {
      throw new NotFoundException(`Player ${steamId} not found`);
    }

    // 排除名单不参与计数：最多差几名，不值得为它多查一次
    const snapshot = await this.fireormService.firestore
      .collection(PLAYER_COLLECTION)
      .where('seasonPointTotal', '>', player.seasonPointTotal ?? 0)
      .limit(RANK_COUNT_LIMIT)
      .count()
      .get();
    const higher = snapshot.data().count;
    return { rank: higher >= RANK_COUNT_LIMIT ? null : higher + 1 };
  }

  private async calculateRanking(id: string, hasLegacySnapshot: boolean): Promise<RankedPlayer[]> {
    const topPlayers = await this.playerRepository
      .orderByDescending('seasonPointTotal')
      .limit(RANKING_SIZE + EXCLUDED_STEAM_IDS.length)
      .find();
    const steamIds = topPlayers
      .map((player) => player.id)
      .filter((steamId) => !EXCLUDED_STEAM_IDS.includes(steamId))
      .slice(0, RANKING_SIZE);

    const summaries = await this.steamProfileApiService.fetchPlayerSummaries(steamIds.map(Number));
    const players = steamIds.map((steamId) => {
      const summary = summaries.get(Number(steamId));
      return {
        steamId,
        personaName: summary?.personaName ?? null,
        avatarUrl: summary?.avatarUrl ?? null,
      };
    });

    // Steam 整体不通时不落库：快照一天只生成一次，存下来就是一整天没有昵称
    if (steamIds.length > 0 && summaries.size === 0) {
      return players;
    }

    if (hasLegacySnapshot) {
      await this.playerRankingRepository.update({ id, players });
    } else {
      await this.playerRankingRepository.create({ id, players });
    }
    return players;
  }
}
