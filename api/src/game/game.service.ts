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
import { PlayerInfoInclude } from '../player-info/assemblers/player-dto.assembler';
import { PlayerInfoService } from '../player-info/player-info.service';
import { SECRET, SERVER_TYPE, SecretService } from '../util/secret/secret.service';

import { GA4ConfigDto } from './dto/ga4-config.dto';
import { GameStart } from './dto/game-start.response';
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
    private readonly playerInfoService: PlayerInfoService,
  ) {}

  /**
   * 开局编排：建档、活动奖励、会员每日积分、GA4 上报、每日任务快照、GA4 配置。
   * `include` 由调用方决定要不要带上 property、heroAwakening（代理路由拆开请求时少传）。
   */
  async start(
    steamIds: number[],
    matchId: number,
    version: string,
    serverType: SERVER_TYPE,
    include: PlayerInfoInclude[],
  ): Promise<GameStart> {
    steamIds = this.validateSteamIds(steamIds);

    const pointInfo: PointInfoDto[] = [];

    // 创建新玩家，更新最后游戏时间
    await Promise.all(steamIds.map((steamId) => this.upsertPlayerInfo(steamId)));

    // 获取活动奖励
    const eventRewardInfo = await this.giveEventReward(steamIds, serverType);
    pointInfo.push(...eventRewardInfo);

    // 获取会员 添加每日会员积分
    const members = await this.membersService.findBySteamIds(steamIds);
    // 添加每日会员积分
    const memberDailyPointInfo = await this.addDailyMemberPoints(members);
    pointInfo.push(...memberDailyPointInfo);

    // ----------------- 以下为统计数据 -----------------
    // 统计数据发送至GA4
    const isLocal = serverType === SERVER_TYPE.LOCAL;
    await this.analyticsService.gameStart(steamIds, matchId, isLocal, serverType, version);

    // ----------------- 以下为返回数据 -----------------
    const steamIdsStr = steamIds.map((id) => id.toString());
    const players = await this.playerInfoService.findPlayerInfoBySteamIds(steamIdsStr, include);

    // 构建响应对象
    const response: GameStart = {
      players,
      pointInfo,
    };

    const dailyTasks = await this.dailyTaskService.getSnapshots(steamIds);
    if (dailyTasks.length > 0) {
      response.dailyTasks = dailyTasks;
    }

    // 获取GA4配置信息
    const ga4Config = this.getGA4Config(serverType);
    if (ga4Config) {
      response.ga4Config = ga4Config;
    }

    return response;
  }

  /** 正式结算：累加每个玩家的战绩与积分，并记录每日任务。 */
  async recordGameEnd(gameEnd: GameEndDto): Promise<void> {
    const players = gameEnd.players.filter((player) => player.steamId > 0);
    // 行为分只在组队局计算
    // TODO: game 发布并保证必带 playerCount 后，去掉回退，统一用 gameEnd.playerCount 判定
    const isParty = (gameEnd.playerCount ?? players.length) >= 2;

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

  /** 上报对局级 GA4 事件（整场与按玩家），与结算规则无关。 */
  async recordMatchAnalytics(gameEnd: GameEndDto, serverType: SERVER_TYPE): Promise<void> {
    await Promise.all([
      this.analyticsService.gameEndMatch(gameEnd, serverType),
      this.analyticsService.gameEndPlayerBot(gameEnd, serverType),
    ]);
  }

  /** 累计报文中每个玩家的生涯统计。 */
  async recordPlayerStats(gameEnd: GameEndDto): Promise<void> {
    await Promise.all(
      gameEnd.players.map((player) =>
        this.playerStatsLifetimeService.accumulate(player.steamId, player, {
          matchId: gameEnd.matchId,
          gameOptions: gameEnd.gameOptions,
        }),
      ),
    );
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
        await this.membersService.checkInMember(member);

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

    return pointInfoDtos;
  }

  async upsertPlayerInfo(steamId: number): Promise<void> {
    await this.playerService.updatePlayerLastMatchTime(steamId);
  }

  // 活动赠送勇士积分/会员
  async giveEventReward(steamIds: number[], serverType: SERVER_TYPE): Promise<PointInfoDto[]> {
    const pointInfoDtos: PointInfoDto[] = [];

    // FIXME 活动每次需要更新
    const startTime = new Date('2026-09-12T00:00:00.000Z');
    const endTime = new Date('2026-09-19T23:59:59.999Z');
    const seasonRewardPoint = 5000;

    const now = new Date();

    // 未知来源的服务器不参与活动
    if (serverType === SERVER_TYPE.UNKNOWN) {
      return pointInfoDtos;
    }

    // 获取玩家奖励记录
    const rewardResults = await this.eventRewardsService.getRewardResults(steamIds);

    for (const rewardResult of rewardResults) {
      // FIXME 活动每次需要更新
      if (now >= startTime && now <= endTime && !rewardResult.result?.compensation20260912) {
        await this.playerService.upsertAddPoint(rewardResult.steamId, {
          seasonPointTotal: seasonRewardPoint,
        });
        await this.eventRewardsService.setReward(rewardResult.steamId);
        pointInfoDtos.push({
          steamId: rewardResult.steamId,
          title: {
            cn: '服务器故障补偿',
            en: 'Server Outage Compensation',
          },
          seasonPoint: seasonRewardPoint,
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
