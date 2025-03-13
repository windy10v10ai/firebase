import { Injectable } from '@nestjs/common';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { PlayerRank } from './entities/player-rank.entity';
import { PlayerRanking } from './entities/player-ranking.entity';
import { Player } from './entities/player.entity';

@Injectable()
export class PlayerRankingService {
  // 排除的SteamId
  private readonly excludeSteamIds = ['424859328', '869192295', '338807313'];

  constructor(
    @InjectRepository(Player)
    private readonly playerRepository: BaseFirestoreRepository<Player>,
    @InjectRepository(PlayerRank)
    private readonly playerRankRepository: BaseFirestoreRepository<PlayerRank>,
    @InjectRepository(PlayerRanking)
    private readonly playerRankingRepository: BaseFirestoreRepository<PlayerRanking>,
  ) {}

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

    // 获取其他分段的分数
    playerRanking.top2000Score = await this.getNextRankScore(playerRanking.top1000Score);
    playerRanking.top3000Score = await this.getNextRankScore(playerRanking.top2000Score);
    playerRanking.top4000Score = await this.getNextRankScore(playerRanking.top3000Score);
    playerRanking.top5000Score = await this.getNextRankScore(playerRanking.top4000Score);

    return await this.playerRankingRepository.create(playerRanking);
  }

  /**
   * 获取下一个分段的分数
   * @param prevScore 上一个分段的分数
   * @param defaultScore 如果没有找到下一个分段的分数，返回0
   */
  private async getNextRankScore(prevScore: number): Promise<number> {
    const players = await this.playerRepository
      .whereLessThan('seasonPointTotal', prevScore)
      .orderByDescending('seasonPointTotal')
      .limit(1000)
      .find();

    return players.length > 0 ? players[players.length - 1].seasonPointTotal : 0;
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
