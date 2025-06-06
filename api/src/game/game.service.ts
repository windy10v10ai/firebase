import { BadRequestException, Injectable } from '@nestjs/common';
import { logger } from 'firebase-functions';

import { EventRewardsService } from '../event-rewards/event-rewards.service';
import { Member } from '../members/entities/members.entity';
import { MembersService } from '../members/members.service';
import { PlayerDto } from '../player/dto/player.dto';
import { PlayerSettingService } from '../player/player-setting.service';
import { PlayerService } from '../player/player.service';
import { PlayerPropertyService } from '../player-property/player-property.service';

import { GameResetPlayerProperty } from './dto/game-reset-player-property';
import { PointInfoDto } from './dto/point-info.dto';
@Injectable()
export class GameService {
  private readonly resetPlayerPropertyMemberPoint = 1000;
  constructor(
    private readonly playerService: PlayerService,
    private readonly membersService: MembersService,
    private readonly eventRewardsService: EventRewardsService,
    private readonly playerPropertyService: PlayerPropertyService,
    private readonly playerSettingService: PlayerSettingService,
  ) {}

  getOK(): string {
    return 'OK';
  }

  validateSteamIds(steamIds: number[]): number[] {
    steamIds = steamIds.filter((id) => id > 0);
    if (steamIds.length > 10) {
      logger.error(`[Game Start] steamIds has length more than 10, ${steamIds}.`);
      throw new BadRequestException();
    }
    return steamIds;
  }

  async addDailyMemberPoints(members: Member[]): Promise<PointInfoDto[]> {
    const pointInfoDtos: PointInfoDto[] = [];
    for (const member of members) {
      const daliyMemberPoint = this.membersService.getDailyMemberPoint(member);
      // 判断是否为会员
      if (daliyMemberPoint > 0) {
        await this.playerService.upsertAddPoint(member.steamId, {
          memberPointTotal: daliyMemberPoint,
        });
        await this.membersService.updateMemberLastDailyDate(member);
        // 返回会员积分信息
        pointInfoDtos.push({
          steamId: member.steamId,
          title: {
            cn: '获得会员经验',
            en: 'Get Member Experience',
          },
          memberPoint: daliyMemberPoint,
        });
      }
    }

    return pointInfoDtos;
  }

  async upsertPlayerInfo(steamId: number): Promise<void> {
    await this.playerService.updatePlayerLastMatchTime(steamId);
  }

  // 活动赠送勇士积分/会员
  async giveEventReward(steamIds: number[]): Promise<PointInfoDto[]> {
    const pointInfoDtos: PointInfoDto[] = [];

    const firstStartTime = new Date('2025-06-01T00:00:00.000Z');
    const firstEndTime = new Date('2025-06-30T23:59:59.999Z');
    const firstRewardPoint = 10000;

    const now = new Date();

    // 获取玩家奖励记录
    const rewardResults = await this.eventRewardsService.getRewardResults(steamIds);

    for (const rewardResult of rewardResults) {
      // FIXME 活动每次需要更新
      if (now >= firstStartTime && now <= firstEndTime && !rewardResult.result?.subscription100k) {
        await this.playerService.upsertAddPoint(rewardResult.steamId, {
          seasonPointTotal: firstRewardPoint,
        });
        await this.eventRewardsService.setReward(rewardResult.steamId);
        pointInfoDtos.push({
          steamId: rewardResult.steamId,
          title: {
            cn: '庆祝订阅突破10万！\n获得10000勇士积分',
            en: 'Subscription reached 100k!\n Get 10,000 Battle Points',
          },
          seasonPoint: firstRewardPoint,
        });
      }
    }
    return pointInfoDtos;
  }

  // 重置玩家属性
  async resetPlayerProperty(gameResetPlayerProperty: GameResetPlayerProperty): Promise<void> {
    const { steamId, useMemberPoint } = gameResetPlayerProperty;

    // FIXME 不使用playerDto，直接使用playerService获取player
    const player = await this.findPlayerDtoBySteamId(steamId);

    if (!player) {
      throw new BadRequestException();
    }

    // 消耗积分
    if (useMemberPoint) {
      const resetPlayerPropertyMemberPoint = this.resetPlayerPropertyMemberPoint;
      if (player.memberPointTotal < resetPlayerPropertyMemberPoint) {
        throw new BadRequestException();
      }
      await this.playerService.upsertAddPoint(steamId, {
        memberPointTotal: -resetPlayerPropertyMemberPoint,
      });
    } else {
      // FIXME 不使用playerDto，直接使用playerService中的方法计算。计算考虑做成helper
      const resetPlayerPropertySeasonPoint = player.seasonNextLevelPoint;
      if (player.seasonPointTotal < resetPlayerPropertySeasonPoint) {
        throw new BadRequestException();
      }
      await this.playerService.upsertAddPoint(steamId, {
        seasonPointTotal: -resetPlayerPropertySeasonPoint,
      });
    }

    // 重置玩家属性
    await this.playerPropertyService.deleteBySteamId(steamId);
  }

  async findPlayerDtoBySteamId(steamId: number): Promise<PlayerDto> {
    const players = await this.findPlayerDtoBySteamIds([steamId.toString()]);
    return players[0];
  }

  async findPlayerDtoBySteamIds(ids: string[]): Promise<PlayerDto[]> {
    const players = (await this.playerService.findByIds(ids)) as PlayerDto[];
    for (const player of players) {
      const properties = await this.playerPropertyService.findBySteamId(+player.id);
      if (properties) {
        player.properties = properties;
      } else {
        player.properties = [];
      }
      const setting = await this.playerSettingService.getPlayerSettingOrGenerateDefault(player.id);
      player.playerSetting = setting;

      const seasonPoint = player.seasonPointTotal;
      const seasonLevel = this.playerService.getSeasonLevelBuyPoint(seasonPoint);
      player.seasonLevel = seasonLevel;
      player.seasonCurrrentLevelPoint =
        seasonPoint - this.playerService.getSeasonTotalPoint(seasonLevel);
      player.seasonNextLevelPoint = this.playerService.getSeasonNextLevelPoint(seasonLevel);

      const memberPoint = player.memberPointTotal;
      const memberLevel = this.playerService.getMemberLevelBuyPoint(memberPoint);
      player.memberLevel = memberLevel;
      player.memberCurrentLevelPoint =
        memberPoint - this.playerService.getMemberTotalPoint(memberLevel);
      player.memberNextLevelPoint = this.playerService.getMemberNextLevelPoint(memberLevel);
      player.totalLevel = seasonLevel + memberLevel;

      const usedLevel = player.properties.reduce((prev, curr) => prev + curr.level, 0);
      player.useableLevel = player.totalLevel - usedLevel;
    }
    return players;
  }
}
