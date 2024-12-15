import { Injectable } from '@nestjs/common';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { UpdatePlayerDto } from './dto/update-player.dto';
import { Player } from './entities/player.entity';

@Injectable()
export class PlayerService {
  constructor(
    @InjectRepository(Player)
    private readonly playerRepository: BaseFirestoreRepository<Player>,
  ) {}

  // 创建新玩家
  async findSteamIdAndNewPlayer(steamId: number) {
    const existPlayer = await this.playerRepository.findById(steamId.toString());
    const player = existPlayer ?? this.genereNewPlayerEntity(steamId);
    if (!existPlayer) {
      await this.playerRepository.create(player);
    }
    return player;
  }

  // 更新积分和最后游戏时间
  async updatePlayerLastMatchTime(
    player: Player,
    seasonPointTotal: number,
    memberPointTotal: number,
  ) {
    player.lastMatchTime = new Date();
    player.seasonPointTotal += seasonPointTotal;
    player.memberPointTotal += memberPointTotal;
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
    const existPlayer = await this.playerRepository.findById(steamId.toString());

    const player = existPlayer ?? this.genereNewPlayerEntity(steamId);

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

    if (existPlayer) {
      await this.playerRepository.update(player);
    } else {
      await this.playerRepository.create(player);
    }
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

  async findTop100SeasonPointSteamIds(): Promise<string[]> {
    const rankingCount = 200;
    const excludeSteamIds = ['424859328', '869192295'];
    const players = await this.playerRepository
      .orderByDescending('seasonPointTotal')
      .limit(rankingCount + excludeSteamIds.length)
      .find();

    return players
      .filter((player) => !excludeSteamIds.includes(player.id))
      .map((player) => player.id);
  }

  async findBySteamId(steamId: number) {
    return await this.playerRepository.findById(steamId.toString());
  }

  async findByIds(ids: string[]): Promise<Player[]> {
    const players = await this.playerRepository.whereIn('id', ids).find();
    return players;
  }

  async upsertAddPoint(steamId: number, updatePlayerDto: UpdatePlayerDto) {
    const existPlayer = await this.playerRepository.findById(steamId.toString());

    const player = existPlayer ?? this.genereNewPlayerEntity(steamId);
    if (updatePlayerDto.memberPointTotal) {
      player.memberPointTotal += updatePlayerDto.memberPointTotal;
    }
    if (updatePlayerDto.seasonPointTotal) {
      player.seasonPointTotal += updatePlayerDto.seasonPointTotal;
    }
    if (existPlayer) {
      return await this.playerRepository.update(player);
    } else {
      return await this.playerRepository.create(player);
    }
  }

  async setMemberLevel(steamId: number, level: number) {
    const point = this.getMemberTotalPoint(level);
    const existPlayer = await this.playerRepository.findById(steamId.toString());

    const player = existPlayer ?? this.genereNewPlayerEntity(steamId);

    player.memberPointTotal += point;
    if (existPlayer) {
      await this.playerRepository.update(player);
    } else {
      await this.playerRepository.create(player);
    }
  }

  private genereNewPlayerEntity(steamId: number): Player {
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

  // ------------------ test code ------------------
  memberLevelList = [{ steamId: 136407523, level: 32 }];
  async initialLevel() {
    for (const memberLevel of this.memberLevelList) {
      await this.setMemberLevel(memberLevel.steamId, memberLevel.level);
    }
  }
}
