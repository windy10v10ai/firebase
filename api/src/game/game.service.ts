import { BadRequestException, Injectable } from '@nestjs/common';
import { logger } from 'firebase-functions';

import { AnalyticsService } from '../analytics/analytics.service';
import { GameEndDto } from '../analytics/dto/game-end-dto';
import { DailyTaskService } from '../daily-task/services/daily-task.service';
import { EventRewardsService } from '../event-rewards/event-rewards.service';
import { Member } from '../members/entities/members.entity';
import { MembersService } from '../members/members.service';
import { PlayerStatsLifetimeService } from '../player/player-stats-lifetime.service';
import { PlayerService } from '../player/player.service';
import { SECRET, SERVER_TYPE, SecretService } from '../util/secret/secret.service';

import { GA4ConfigDto } from './dto/ga4-config.dto';
import { PointInfoDto } from './dto/point-info.dto';
@Injectable()
export class GameService {
  constructor(
    private readonly playerService: PlayerService,
    private readonly dailyTaskService: DailyTaskService,
    private readonly analyticsService: AnalyticsService,
    private readonly playerStatsLifetimeService: PlayerStatsLifetimeService,
    private readonly membersService: MembersService,
    private readonly eventRewardsService: EventRewardsService,
    private readonly secretService: SecretService,
  ) {}

  /** 正式结算：累加每个玩家的战绩与积分，并记录每日任务。 */
  async recordGameEnd(gameEnd: GameEndDto): Promise<void> {
    const players = gameEnd.players.filter((player) => player.steamId > 0);
    // 行为分只在组队局计算
    const isParty = players.length >= 2;

    await Promise.all(
      players.map((player) =>
        this.playerService.upsertGameEnd(
          player.steamId,
          player.teamId === gameEnd.winnerTeamId,
          player.battlePoints,
          player.isDisconnected,
          isParty,
        ),
      ),
    );

    await this.dailyTaskService.recordGameEnd(gameEnd.players);
  }

  /** 上报对局统计，与结算规则无关，正式结算与本地结算共用。 */
  async recordMatchStats(gameEnd: GameEndDto, serverType: SERVER_TYPE): Promise<void> {
    await Promise.all([
      this.analyticsService.gameEndMatch(gameEnd, serverType),
      this.analyticsService.gameEndPlayerBot(gameEnd, serverType),
      ...gameEnd.players.map((player) =>
        this.playerStatsLifetimeService.accumulate(player.steamId, player, {
          matchId: gameEnd.matchId,
          gameOptions: gameEnd.gameOptions,
        }),
      ),
    ]);
  }

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
      const { dailyPoint, catchUpDays, catchUpPoint } =
        this.membersService.getCheckInPoints(member);
      const totalPoint = dailyPoint + catchUpPoint;
      // 判断是否为会员
      if (totalPoint > 0) {
        await this.playerService.upsertAddPoint(member.steamId, {
          memberPointTotal: totalPoint,
        });
        await this.membersService.updateMemberLastDailyDate(member);

        if (dailyPoint > 0) {
          pointInfoDtos.push({
            steamId: member.steamId,
            title: {
              cn: '获得会员经验',
              en: 'Get Member Experience',
            },
            memberPoint: dailyPoint,
          });
        }
        if (catchUpDays > 0) {
          pointInfoDtos.push({
            steamId: member.steamId,
            title: {
              cn: `补签会员经验 x${catchUpDays}天`,
              en: `Member Check-in Catch-up x${catchUpDays} day(s)`,
            },
            memberPoint: catchUpPoint,
          });
        }
      }
    }

    return pointInfoDtos;
  }

  async upsertPlayerInfo(steamId: number): Promise<void> {
    await this.playerService.updatePlayerLastMatchTime(steamId);
  }

  // 活动赠送勇士积分/会员
  async giveEventReward(steamIds: number[], serverType: SERVER_TYPE): Promise<PointInfoDto[]> {
    const pointInfoDtos: PointInfoDto[] = [];

    // FIXME 活动每次需要更新
    const startTime = new Date('2026-08-02T00:00:00.000Z');
    const endTime = new Date('2026-08-09T23:59:59.999Z');
    const memberRewardPoint = 2000;

    const now = new Date();

    // 未知来源的服务器不参与活动
    if (serverType === SERVER_TYPE.UNKNOWN) {
      return pointInfoDtos;
    }

    // 获取玩家奖励记录
    const rewardResults = await this.eventRewardsService.getRewardResults(steamIds);

    for (const rewardResult of rewardResults) {
      // FIXME 活动每次需要更新
      if (now >= startTime && now <= endTime && !rewardResult.result?.awaken20260802) {
        await this.playerService.upsertAddPoint(rewardResult.steamId, {
          memberPointTotal: memberRewardPoint,
        });
        await this.eventRewardsService.setReward(rewardResult.steamId);
        pointInfoDtos.push({
          steamId: rewardResult.steamId,
          title: {
            cn: '觉醒活动奖励',
            en: 'Awaken Event Reward',
          },
          memberPoint: memberRewardPoint,
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
    // 来源不明的服务器不参与GA4统计
    if (serverType === SERVER_TYPE.UNKNOWN) {
      return undefined;
    }

    const measurementId = process.env.GA_MEASUREMENT_ID;
    const apiSecret = this.secretService.getSecretValue(SECRET.GA4_API_SECRET);

    if (measurementId && apiSecret) {
      return {
        measurementId,
        apiSecret,
        serverType,
      };
    }

    return undefined;
  }
}
