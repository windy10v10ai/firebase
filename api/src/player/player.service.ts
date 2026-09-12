import { BadRequestException, Injectable } from '@nestjs/common';
import { logger } from 'firebase-functions';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { AnalyticsService } from '../analytics/analytics.service';

import { UpdatePlayerDto } from './dto/update-player.dto';
import { UsePlayerMemberPointsDto } from './dto/use-player-member-points.dto';
import { Player } from './entities/player.entity';
import { PlayerConductService } from './player-conduct.service';

const MAX_BATTLE_POINTS_PER_MATCH = 500;

@Injectable()
export class PlayerService {
  constructor(
    @InjectRepository(Player)
    private readonly playerRepository: BaseFirestoreRepository<Player>,
    private readonly analyticsService: AnalyticsService,
    private readonly playerConductService: PlayerConductService,
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
    battlePoints: number,
    isDisconnect: boolean,
    calculateConductPoint: boolean,
  ): Promise<void> {
    const normalizedPoints = this.normalizeBattlePoints(battlePoints);
    if (normalizedPoints !== battlePoints) {
      logger.warn('game/end: battlePoints out of range, normalizing', {
        steamId,
        battlePoints,
        normalizedPoints,
      });
    }
    // 结算不创建玩家：开局接口已经创建过，查不到说明这次结算没有对应的开局
    const player = await this.playerRepository.findById(steamId.toString());
    if (!player) {
      logger.warn('game/end: player not found, skip', { steamId });
      return;
    }

    player.matchCount++;
    if (isWinner) {
      player.winCount++;
    }

    player.seasonPointTotal += normalizedPoints;

    if (isDisconnect) {
      player.disconnectCount++;
    }
    // 行为分被冒用会害到别人，只有可信来源才计算
    if (calculateConductPoint) {
      player.conductPoint = this.playerConductService.calculateGameEndConductPoint(
        player.conductPoint ?? 100,
        isDisconnect,
      );
    }

    await this.playerRepository.update(player);
  }

  // 仅供测试初始化使用，生产代码不应调用；matchCount 的正常变动走 upsertGameEnd。
  async setMatchCount(steamId: number, value: number): Promise<void> {
    const player = await this.getOrNewPlayerBySteamId(steamId);
    player.matchCount = value;
    await this.playerRepository.update(player);
  }

  normalizeBattlePoints(battlePoints: number): number {
    if (!Number.isFinite(battlePoints)) {
      return 0;
    }
    return Math.min(MAX_BATTLE_POINTS_PER_MATCH, Math.max(0, battlePoints));
  }

  async findBySteamId(steamId: number): Promise<Player> {
    return await this.playerRepository.findById(steamId.toString());
  }

  async findByIds(ids: string[]): Promise<Player[]> {
    const players = await this.playerRepository.whereIn('id', ids).find();
    return players;
  }

  async findAllWithUsedLevelGreaterThanZero(): Promise<Player[]> {
    return this.playerRepository.whereGreaterThan('usedLevel', 0).find();
  }

  async reduceUsedPoint(
    steamId: number,
    dto: Pick<UpdatePlayerDto, 'usedSeasonPoint' | 'usedMemberPoint'>,
  ) {
    const player = await this.playerRepository.findById(steamId.toString());
    if (!player) {
      return;
    }

    if (dto.usedSeasonPoint) {
      player.usedSeasonPoint = Math.max(0, (player.usedSeasonPoint ?? 0) - dto.usedSeasonPoint);
    }
    if (dto.usedMemberPoint) {
      player.usedMemberPoint = Math.max(0, (player.usedMemberPoint ?? 0) - dto.usedMemberPoint);
    }
    return await this.playerRepository.update(player);
  }

  async upsertAddPoint(steamId: number, updatePlayerDto: UpdatePlayerDto) {
    const player = await this.getOrNewPlayerBySteamId(steamId);

    if (updatePlayerDto.memberPointTotal) {
      player.memberPointTotal = (player.memberPointTotal ?? 0) + updatePlayerDto.memberPointTotal;
    }
    if (updatePlayerDto.seasonPointTotal) {
      player.seasonPointTotal = (player.seasonPointTotal ?? 0) + updatePlayerDto.seasonPointTotal;
    }
    if (updatePlayerDto.usedMemberPoint) {
      player.usedMemberPoint = (player.usedMemberPoint ?? 0) + updatePlayerDto.usedMemberPoint;
    }
    if (updatePlayerDto.usedSeasonPoint) {
      player.usedSeasonPoint = (player.usedSeasonPoint ?? 0) + updatePlayerDto.usedSeasonPoint;
    }
    return await this.playerRepository.update(player);
  }

  async useMemberPoint(dto: UsePlayerMemberPointsDto): Promise<Player> {
    const memberPoint = Math.trunc(dto.memberPoint);
    if (memberPoint < 1) {
      throw new BadRequestException();
    }

    const player = await this.findBySteamId(dto.steamId);
    if (!player) {
      throw new BadRequestException();
    }

    const useableMemberPoint = (player.memberPointTotal ?? 0) - (player.usedMemberPoint ?? 0);
    if (useableMemberPoint < memberPoint) {
      throw new BadRequestException();
    }

    player.usedMemberPoint = (player.usedMemberPoint ?? 0) + memberPoint;
    await this.playerRepository.update(player);
    await this.analyticsService.playerUsePoint(dto.steamId, memberPoint, true, dto.reason);
    return player;
  }

  // 仅供测试初始化使用，生产代码不应调用；conductPoint 的正常变动走 PlayerConductService。
  async setConductPoint(steamId: number, value: number): Promise<void> {
    const player = await this.getOrNewPlayerBySteamId(steamId);
    player.conductPoint = this.playerConductService.clampConductPoint(value);
    await this.playerRepository.update(player);
  }

  async setUsedLevel(steamId: number, value: number): Promise<void> {
    const player = await this.getOrNewPlayerBySteamId(steamId);
    player.usedLevel = value < 0 ? 0 : value;
    await this.playerRepository.update(player);
  }

  private generateNewPlayerEntity(steamId: number): Player {
    return {
      id: steamId.toString(),
      matchCount: 0,
      winCount: 0,
      disconnectCount: 0,
      seasonPointTotal: 0,
      memberPointTotal: 0,
      usedSeasonPoint: 0,
      usedMemberPoint: 0,
      usedLevel: 0,
      lastMatchTime: null,
      conductPoint: 100,
      commendCount: 0,
      reportCount: 0,
    };
  }
}
