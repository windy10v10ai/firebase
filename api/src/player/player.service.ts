import { Injectable } from '@nestjs/common';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { AnalyticsService } from '../analytics/analytics.service';

import { UpdatePlayerDto } from './dto/update-player.dto';
import { PlayerRank } from './entities/player-rank.entity';
import { PlayerRanking } from './entities/player-ranking.entity';
import { Player } from './entities/player.entity';

@Injectable()
export class PlayerService {
  // 排除的SteamId
  private readonly excludeSteamIds = ['424859328', '869192295', '338807313'];

  constructor(
    @InjectRepository(Player)
    private readonly playerRepository: BaseFirestoreRepository<Player>,
    @InjectRepository(PlayerRank)
    private readonly playerRankRepository: BaseFirestoreRepository<PlayerRank>,
    @InjectRepository(PlayerRanking)
    private readonly playerRankingRepository: BaseFirestoreRepository<PlayerRanking>,
    private readonly analyticsService: AnalyticsService,
  ) {}

  /**
   * 根据 Steam ID 获取或创建新玩家。
   *
   * @param steamId - 玩家 Steam ID
   * @returns 返回玩家实体
   */
  async getOrNewPlayerBySteamId(steamId: number) {
    const existPlayer = await this.playerRepository.findById(steamId.toString());
    const player = existPlayer ?? this.generateNewPlayerEntity(steamId);
    if (!existPlayer) {
      await this.playerRepository.create(player);
      await this.analyticsService.playerCreate(steamId);
    }
    return player;
  }

  // 更新积分和最后游戏时间
  async updatePlayerLastMatchTime(steamId: number) {
    const player = await this.getOrNewPlayerBySteamId(steamId);
    player.lastMatchTime = new Date();
    await this.playerRepository.update(player);
    return player;
  }

  async upsertGameEnd(
    steamId: number,
    isWinner: boolean,
    seasonPoint: number,
    isDisconnect: boolean,
  ) {
    if (isNaN(seasonPoint)) {
      seasonPoint = 0;
    }
    const player = await this.getOrNewPlayerBySteamId(steamId);

    player.matchCount++;
    if (isWinner) {
      player.winCount++;
    }
    player.seasonPointTotal += seasonPoint;
    if (isDisconnect) {
      player.disconnectCount++;
    }
    // 行为分计算
    if (isDisconnect) {
      player.conductPoint -= 5;
    } else {
      player.conductPoint += 1;
    }
    // conductPoint max 100 min 0
    player.conductPoint = Math.min(100, player.conductPoint);
    player.conductPoint = Math.max(0, player.conductPoint);

    await this.playerRepository.update(player);
  }

  async getPlayerTotalLevel(steamId: number) {
    const player = await this.playerRepository.findById(steamId.toString());
    if (!player) {
      return 0;
    }
    const seasonPoint = player.seasonPointTotal;
    const seasonLevel = this.getSeasonLevelBuyPoint(seasonPoint);
    const memberPoint = player.memberPointTotal;
    const memberLevel = this.getMemberLevelBuyPoint(memberPoint);
    return seasonLevel + memberLevel;
  }

  async findBySteamId(steamId: number) {
    return await this.playerRepository.findById(steamId.toString());
  }

  async findByIds(ids: string[]): Promise<Player[]> {
    const players = await this.playerRepository.whereIn('id', ids).find();
    return players;
  }

  async upsertAddPoint(steamId: number, updatePlayerDto: UpdatePlayerDto) {
    const player = await this.getOrNewPlayerBySteamId(steamId);

    if (updatePlayerDto.memberPointTotal) {
      player.memberPointTotal += updatePlayerDto.memberPointTotal;
    }
    if (updatePlayerDto.seasonPointTotal) {
      player.seasonPointTotal += updatePlayerDto.seasonPointTotal;
    }
    return await this.playerRepository.update(player);
  }

  private generateNewPlayerEntity(steamId: number): Player {
    return {
      id: steamId.toString(),
      matchCount: 0,
      winCount: 0,
      disconnectCount: 0,
      seasonPointTotal: 0,
      memberPointTotal: 0,
      lastMatchTime: null,
      conductPoint: 100,
    };
  }

  /**
   * 赛季积分
   * @param level 当前等级
   * @returns 升级积分
   */
  getSeasonNextLevelPoint(level: number) {
    return 100 * level;
  }
  /**
   * 赛季积分 指定等级所需累计积分
   * @param level 指定等级
   * @returns 累计积分
   */
  getSeasonTotalPoint(level: number) {
    return 50 * (level - 1) * level;
  }
  // 根据积分获取当前等级
  getSeasonLevelBuyPoint(point: number) {
    return Math.floor(Math.sqrt(point / 50 + 0.25) + 0.5);
  }

  /**
   * 会员积分
   * @param level 当前等级
   * @returns 升级积分
   */
  getMemberNextLevelPoint(level: number) {
    return 50 * (level + 19);
  }
  /**
   * 会员积分
   * @param level 指定等级
   * @returns 累计积分
   */
  getMemberTotalPoint(level: number) {
    level -= 1;
    return 100 * ((level * level) / 4 + level * 9.75);
  }
  // 根据积分获取当前等级
  getMemberLevelBuyPoint(point: number) {
    return Math.floor(Math.sqrt(point / 25 + 380.25) - 19.5) + 1;
  }

  /**
   * 获取玩家排名信息
   */
  async getRanking(): Promise<PlayerRanking> {
    const playerRanking = await this.getRankingToday();

    if (playerRanking) {
      return playerRanking;
    } else {
      return await this.calculateRanking();
    }
  }

  async getRankingToday(): Promise<PlayerRanking> {
    const id = this.getDateString();
    return await this.playerRankingRepository.findById(id);
  }

  async calculateRanking(): Promise<PlayerRanking> {
    const playerRanking = new PlayerRanking();
    playerRanking.id = this.getDateString();

    // 获取前1000名玩家详细排名
    const topPlayers = await this.playerRepository
      .orderByDescending('seasonPointTotal')
      .limit(1000)
      .find();
    playerRanking.topSteamIds = topPlayers
      .filter((player) => !this.excludeSteamIds.includes(player.id))
      .map((player) => player.id);

    // 获取第1000名玩家的分数
    playerRanking.top1000Score = topPlayers[topPlayers.length - 1].seasonPointTotal;

    // 获取第2000名玩家的分数
    const top2000Players = await this.playerRepository
      .whereLessThan('seasonPointTotal', playerRanking.top1000Score)
      .orderByDescending('seasonPointTotal')
      .limit(1000)
      .find();
    playerRanking.top2000Score = top2000Players[top2000Players.length - 1].seasonPointTotal;

    // 获取第3000名玩家的分数
    const top3000Players = await this.playerRepository
      .whereLessThan('seasonPointTotal', playerRanking.top2000Score)
      .orderByDescending('seasonPointTotal')
      .limit(1000)
      .find();
    playerRanking.top3000Score = top3000Players[top3000Players.length - 1].seasonPointTotal;

    // 获取第4000名玩家的分数
    const top4000Players = await this.playerRepository
      .whereLessThan('seasonPointTotal', playerRanking.top3000Score)
      .orderByDescending('seasonPointTotal')
      .limit(1000)
      .find();
    playerRanking.top4000Score = top4000Players[top4000Players.length - 1].seasonPointTotal;

    // 获取第5000名玩家的分数
    const top5000Players = await this.playerRepository
      .whereLessThan('seasonPointTotal', playerRanking.top4000Score)
      .orderByDescending('seasonPointTotal')
      .limit(1000)
      .find();
    playerRanking.top5000Score = top5000Players[top5000Players.length - 1].seasonPointTotal;

    return await this.playerRankingRepository.create(playerRanking);
  }

  // 旧版排行 GameController 使用 之后删除
  async getPlayerRank(): Promise<PlayerRank> {
    const playerRank = await this.getPlayerRankToday();

    if (playerRank) {
      return playerRank;
    } else {
      const rankSteamIds = await this.findTopSeasonPointSteamIds();
      return await this.updatePlayerRankToday(rankSteamIds);
    }
  }

  async getPlayerRankToday(): Promise<PlayerRank> {
    const id = this.getDateString();
    return await this.playerRankRepository.findById(id);
  }

  async updatePlayerRankToday(steamIds: string[]): Promise<PlayerRank> {
    const id = this.getDateString();
    const playerRank = new PlayerRank();
    playerRank.id = id;
    playerRank.rankSteamIds = steamIds;
    return await this.playerRankRepository.create(playerRank);
  }

  private async findTopSeasonPointSteamIds(): Promise<string[]> {
    const rankingCount = 200;
    const players = await this.playerRepository
      .orderByDescending('seasonPointTotal')
      .limit(rankingCount + this.excludeSteamIds.length)
      .find();

    return players
      .filter((player) => !this.excludeSteamIds.includes(player.id))
      .map((player) => player.id);
  }

  // 获取当前日期字符串
  private getDateString() {
    return new Date().toISOString().slice(0, 10).replace(/-/g, '');
  }
}
