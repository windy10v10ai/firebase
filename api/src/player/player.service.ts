import { Injectable } from '@nestjs/common';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { AnalyticsService } from '../analytics/analytics.service';

import { UpdatePlayerDto } from './dto/update-player.dto';
import { Player } from './entities/player.entity';

@Injectable()
export class PlayerService {
  constructor(
    @InjectRepository(Player)
    private readonly playerRepository: BaseFirestoreRepository<Player>,
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
    isParty: boolean,
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
    // 行为分计算：只有组队时才计算
    if (isParty) {
      if (isDisconnect) {
        player.conductPoint -= 10;
      } else {
        player.conductPoint += 1;
      }
      // conductPoint max 100 min 0
      player.conductPoint = Math.min(100, player.conductPoint);
      player.conductPoint = Math.max(0, player.conductPoint);
    }

    await this.playerRepository.update(player);
  }

  async findBySteamId(steamId: number): Promise<Player> {
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

  async setConductPoint(steamId: number, value: number): Promise<void> {
    const player = await this.getOrNewPlayerBySteamId(steamId);
    player.conductPoint = Math.min(100, Math.max(0, value));
    await this.playerRepository.update(player);
  }

  async setUsedLevel(steamId: number, value: number): Promise<void> {
    const player = await this.getOrNewPlayerBySteamId(steamId);
    player.usedLevel = value < 0 ? 0 : value;
    await this.playerRepository.update(player);
  }

  // TODO: 临时统计接口，用完删除
  async getConductPointStats(): Promise<{
    totalPlayers: number;
    buckets: { range: string; count: number; percentage: string }[];
  }> {
    const aprilStart = new Date('2026-04-01T00:00:00.000Z');
    const allPlayers = await this.playerRepository
      .whereGreaterOrEqualThan('lastMatchTime', aprilStart)
      .find();

    const total = allPlayers.length;
    const bucketDefs = [
      { label: '100', min: 100, max: 100 },
      { label: '80~99', min: 80, max: 99 },
      { label: '60~89', min: 60, max: 79 },
      { label: '0~59', min: 0, max: 59 },
    ];

    const buckets = bucketDefs.map(({ label, min, max }) => {
      const count = allPlayers.filter(
        (p) => (p.conductPoint ?? 100) >= min && (p.conductPoint ?? 100) <= max,
      ).length;
      return {
        range: label,
        count,
        percentage: total > 0 ? ((count / total) * 100).toFixed(1) + '%' : '0%',
      };
    });

    return { totalPlayers: total, buckets };
  }

  private generateNewPlayerEntity(steamId: number): Player {
    return {
      id: steamId.toString(),
      matchCount: 0,
      winCount: 0,
      disconnectCount: 0,
      seasonPointTotal: 0,
      memberPointTotal: 0,
      usedLevel: 0,
      lastMatchTime: null,
      conductPoint: 100,
    };
  }
}
