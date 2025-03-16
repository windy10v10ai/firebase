import { BadRequestException, Injectable } from '@nestjs/common';
import { logger } from 'firebase-functions';

import { EventRewardsService } from '../event-rewards/event-rewards.service';
import { Member } from '../members/entities/members.entity';
import { MembersService } from '../members/members.service';
import { PlayerService } from '../player/player.service';
import { PlayerPropertyService } from '../player-property/player-property.service';

import { GameResetPlayerProperty } from './dto/game-reset-player-property';
import { PlayerDto } from './dto/player.dto';
import { PointInfoDto } from './dto/point-info.dto';

@Injectable()
export class GameService {
  private readonly resetPlayerPropertyMemberPoint = 1000;
  constructor(
    private readonly playerService: PlayerService,
    private readonly membersService: MembersService,
    private readonly eventRewardsService: EventRewardsService,
    private readonly playerPropertyService: PlayerPropertyService,
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
    const memberDailyPoint = +process.env.MEMBER_DAILY_POINT;
    if (isNaN(memberDailyPoint)) {
      logger.error(`[Game Start] MEMBER_DAILY_POINT is NaN.`);
      return [];
    }

    const pointInfoDtos: PointInfoDto[] = [];
    for (const member of members) {
      const daliyMemberPoint = this.membersService.getDailyMemberPoint(member);
      // 判断是否为会员
      if (daliyMemberPoint > 0) {
        await this.playerService.upsertAddPoint(member.steamId, {
          memberPointTotal: memberDailyPoint,
        });
        await this.membersService.updateMemberLastDailyDate(member);
        // 返回会员积分信息
        pointInfoDtos.push({
          steamId: member.steamId,
          title: {
            cn: '获得会员积分',
            en: 'Get Member Daily Points',
          },
          memberPoint: memberDailyPoint,
        });
      }
    }

    return pointInfoDtos;
  }

  async upsertPlayerInfo(steamId: number): Promise<void> {
    await this.playerService.updatePlayerLastMatchTime(steamId);
  }

  // 活动赠送赛季积分/会员
  async giveEventReward(steamIds: number[]): Promise<PointInfoDto[]> {
    const pointInfoDtos: PointInfoDto[] = [];
    const startTime = new Date('2025-03-16T00:00:00.000Z');
    const endTime = new Date('2025-03-24T00:00:00.000Z');
    const rewardSeasonPoint = 2000;

    const now = new Date();
    if (now < startTime || now > endTime) {
      return pointInfoDtos;
    }

    // [注意] 活动每次需要更新
    const rewardResults = await this.eventRewardsService.getRewardResults(steamIds);
    for (const rewardResult of rewardResults) {
      if (rewardResult.result === false) {
        // 奖励两周会员
        // await this.membersService.addMember({
        //   steamId: rewardResult.steamId,
        //   month: 0.5,
        // });
        // 奖励赛季积分
        await this.playerService.upsertAddPoint(rewardResult.steamId, {
          seasonPointTotal: rewardSeasonPoint,
        });
        await this.eventRewardsService.setReward(rewardResult.steamId);
        pointInfoDtos.push({
          steamId: rewardResult.steamId,
          title: {
            cn: '庆在线突破800人！\n获得2000赛季积分',
            en: 'Online player reach 800!\n Get 2000 Season Points',
          },
          seasonPoint: rewardSeasonPoint,
        });
      }
    }
    return pointInfoDtos;
  }

  // 重置玩家属性
  async resetPlayerProperty(gameResetPlayerProperty: GameResetPlayerProperty): Promise<void> {
    const { steamId, useMemberPoint } = gameResetPlayerProperty;

    const player = (await this.findPlayerDtoBySteamIds([steamId.toString()]))[0];

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
