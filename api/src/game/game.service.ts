import { BadRequestException, Injectable } from '@nestjs/common';
import { logger } from 'firebase-functions';

import { EventRewardsService } from '../event-rewards/event-rewards.service';
import { Member } from '../members/entities/members.entity';
import { MembersService } from '../members/members.service';
import { PlayerService } from '../player/player.service';
import { SECRET, SERVER_TYPE, SecretService } from '../util/secret/secret.service';

import { GA4ConfigDto } from './dto/ga4-config.dto';
import { PointInfoDto } from './dto/point-info.dto';
@Injectable()
export class GameService {
  constructor(
    private readonly playerService: PlayerService,
    private readonly membersService: MembersService,
    private readonly eventRewardsService: EventRewardsService,
    private readonly secretService: SecretService,
  ) {}

  getOK(): string {
    return 'OK';
  }

  validateSteamIds(steamIds: number[]): number[] {
    steamIds = steamIds.filter((id) => id > 0);
    if (steamIds.length > 10) {
      logger.warn(`[Game Start] steamIds has length more than 10, ${steamIds}.`);
      throw new BadRequestException();
    } else if (steamIds.length === 0) {
      logger.warn(`[Game Start] steamIds is empty, ${steamIds}.`);
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

    const firstStartTime = new Date('2026-02-06T00:00:00.000Z');
    const firstEndTime = new Date('2026-02-23T23:59:59.999Z');
    const firstRewardPoint = 5000;

    const now = new Date();

    // 获取玩家奖励记录
    const rewardResults = await this.eventRewardsService.getRewardResults(steamIds);

    for (const rewardResult of rewardResults) {
      // FIXME 活动每次需要更新
      if (now >= firstStartTime && now <= firstEndTime && !rewardResult.result?.lunarNewYear2026) {
        await this.playerService.upsertAddPoint(rewardResult.steamId, {
          seasonPointTotal: firstRewardPoint,
        });
        await this.eventRewardsService.setReward(rewardResult.steamId);
        pointInfoDtos.push({
          steamId: rewardResult.steamId,
          title: {
            cn: '新春快乐',
            en: 'Happy Lunar New Year',
          },
          seasonPoint: firstRewardPoint,
        });
      }
    }
    return pointInfoDtos;
  }

  /**
   * 获取GA4配置信息
   * @param serverType 服务器类型
   * @returns GA4配置信息，如果不符合条件则返回undefined
   */
  getGA4Config(serverType: SERVER_TYPE): GA4ConfigDto | undefined {
    // WINDY、TEST、TENVTEN服务器返回GA4配置信息
    if (
      serverType === SERVER_TYPE.WINDY ||
      serverType === SERVER_TYPE.TEST ||
      serverType === SERVER_TYPE.TENVTEN
    ) {
      const measurementId = process.env.GA_MEASUREMENT_ID;
      const apiSecret = this.secretService.getSecretValue(SECRET.GA4_API_SECRET);

      if (measurementId && apiSecret) {
        return {
          measurementId,
          apiSecret,
          serverType,
        };
      }
    }

    return undefined;
  }
}
