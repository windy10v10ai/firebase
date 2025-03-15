import { Injectable } from '@nestjs/common';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { PlayerRanking } from './entities/player-ranking.entity';
import { Player } from './entities/player.entity';

@Injectable()
export class PlayerRankingService {
  // 排除的SteamId
  private readonly excludeSteamIds = ['424859328', '869192295', '338807313'];

  constructor(
    @InjectRepository(Player)
    private readonly playerRepository: BaseFirestoreRepository<Player>,
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
    playerRanking.rankScores = {
      top1000: 0,
      top2000: 0,
      top3000: 0,
      top4000: 0,
      top5000: 0,
    };

    // 获取前1000名玩家详细排名
    const topPlayers = await this.playerRepository
      .orderByDescending('seasonPointTotal')
      .limit(1000)
      .find();
    playerRanking.topSteamIds = topPlayers
      .filter((player) => !this.excludeSteamIds.includes(player.id))
      .map((player) => player.id);

    // 如果没有玩家，返回空排名
    if (topPlayers.length === 0) {
      return await this.playerRankingRepository.create(playerRanking);
    }

    // 获取第1000名玩家的分数
    playerRanking.rankScores.top1000 = topPlayers[topPlayers.length - 1].seasonPointTotal;

    // 获取其他分段的分数
    playerRanking.rankScores.top2000 = await this.getNextRankScore(
      playerRanking.rankScores.top1000,
    );
    playerRanking.rankScores.top3000 = await this.getNextRankScore(
      playerRanking.rankScores.top2000,
    );
    playerRanking.rankScores.top4000 = await this.getNextRankScore(
      playerRanking.rankScores.top3000,
    );
    playerRanking.rankScores.top5000 = await this.getNextRankScore(
      playerRanking.rankScores.top4000,
    );

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

  // 获取当前日期字符串
  private getDateString() {
    return new Date().toISOString().slice(0, 10).replace(/-/g, '');
  }
}
