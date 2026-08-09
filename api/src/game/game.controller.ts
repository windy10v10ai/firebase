import {
  Body,
  Controller,
  Get,
  ParseArrayPipe,
  ParseIntPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { logger } from 'firebase-functions';

import { AnalyticsService } from '../analytics/analytics.service';
import { GameEndDto } from '../analytics/dto/game-end-dto';
import { DailyChallengeGameEndRewardDto } from '../daily-challenge/dto/daily-challenge-game-end-reward.dto';
import { DailyChallengePlayerSnapshotDto } from '../daily-challenge/dto/daily-challenge-player-snapshot.dto';
import { DailyChallengePlayerService } from '../daily-challenge/services/daily-challenge-player.service';
import { DailyChallengeProgressService } from '../daily-challenge/services/daily-challenge-progress.service';
import { DailyChallengeRewardNotificationService } from '../daily-challenge/services/daily-challenge-reward-notification.service';
import { DailyChallengeSettlementService } from '../daily-challenge/services/daily-challenge-settlement.service';
import { MembersService } from '../members/members.service';
import { PlayerStatsLifetimeService } from '../player/player-stats-lifetime.service';
import { PlayerService } from '../player/player.service';
import { PlayerInfoDto } from '../player-info/dto/player-info.dto';
import { PlayerInfoService } from '../player-info/player-info.service';
import { Public } from '../util/auth/public.decorator';
import { SERVER_TYPE, SecretService } from '../util/secret/secret.service';

import { GameStart } from './dto/game-start.response';
import { PointInfoDto } from './dto/point-info.dto';
import { GameService } from './game.service';

@ApiTags('Game')
@Controller('game')
export class GameController {
  constructor(
    private readonly gameService: GameService,
    private readonly membersService: MembersService,
    private readonly playerService: PlayerService,
    private readonly analyticsService: AnalyticsService,
    private readonly secretService: SecretService,
    private readonly playerInfoService: PlayerInfoService,
    private readonly playerStatsLifetimeService: PlayerStatsLifetimeService,
    private readonly dailyChallengePlayerService: DailyChallengePlayerService,
    private readonly dailyChallengeProgressService: DailyChallengeProgressService,
    private readonly dailyChallengeSettlementService: DailyChallengeSettlementService,
    private readonly dailyChallengeRewardNotificationService: DailyChallengeRewardNotificationService,
  ) {}

  @Public()
  @Get('start')
  async start(
    @Query('steamIds', new ParseArrayPipe({ items: Number, separator: ',' }))
    steamIds: number[],
    @Query('matchId', new ParseIntPipe()) matchId: number,
    @Query('version') version: string,
    @Req() req: Request,
  ): Promise<GameStart> {
    const apiKey = req.headers['x-api-key'] as string;
    const serverType = this.secretService.getServerTypeByApiKey(apiKey);
    if (serverType === SERVER_TYPE.UNKNOWN) {
      logger.warn('game/start: unknown server type', { apiKey });
      return {
        players: [{} as PlayerInfoDto],
        pointInfo: [],
      };
    }
    steamIds = this.gameService.validateSteamIds(steamIds);
    const matchStartedAt = new Date();

    const pointInfo: PointInfoDto[] = [];

    // 创建新玩家，更新最后游戏时间
    await Promise.all(steamIds.map((steamId) => this.gameService.upsertPlayerInfo(steamId)));

    // 获取活动奖励
    const eventRewardInfo = await this.gameService.giveEventReward(steamIds, serverType);
    pointInfo.push(...eventRewardInfo);

    // 获取会员 添加每日会员积分
    const members = await this.membersService.findBySteamIds(steamIds);
    // 添加每日会员积分
    const memberDailyPointInfo = await this.gameService.addDailyMemberPoints(members);
    pointInfo.push(...memberDailyPointInfo);

    // Catch up ended challenge days without blocking the base game start.
    try {
      await this.dailyChallengeSettlementService.reconcile(matchStartedAt);
    } catch (error) {
      logger.warn('game/start: daily challenge settlement unavailable', { error });
    }

    // Points are already granted by the idempotent ledger; only claim display notices here.
    try {
      const challengePointInfo = await this.dailyChallengeRewardNotificationService.claimPointInfo(
        steamIds,
        matchStartedAt,
      );
      pointInfo.push(...challengePointInfo);
    } catch (error) {
      logger.warn('game/start: daily challenge reward notifications unavailable', { error });
    }

    // ----------------- 以下为统计数据 -----------------
    // 统计数据发送至GA4
    const isLocal = serverType === SERVER_TYPE.LOCAL;
    await this.analyticsService.gameStart(steamIds, matchId, isLocal, serverType, version);

    // ----------------- 以下为返回数据 -----------------
    const steamIdsStr = steamIds.map((id) => id.toString());
    const players = await this.playerInfoService.findPlayerInfoBySteamIds(steamIdsStr, [
      'member',
      'property',
      'setting',
      'statsLifetime',
      'heroAwakening',
    ]);

    // 构建响应对象
    // Daily challenges are an optional extension and must not block the base game start response.
    let dailyChallenges: Awaited<ReturnType<DailyChallengePlayerService['getSnapshots']>>;
    try {
      dailyChallenges = await this.dailyChallengePlayerService.getSnapshots(
        steamIds,
        matchStartedAt,
      );
    } catch (error) {
      logger.warn('game/start: daily challenge snapshots unavailable', { error });
    }
    const response: GameStart = {
      players,
      pointInfo,
      matchStartedAt: matchStartedAt.toISOString(),
    };
    if (dailyChallenges) {
      response.dailyChallenges = dailyChallenges;
    }

    // 获取GA4配置信息
    const ga4Config = this.gameService.getGA4Config(serverType);
    if (ga4Config) {
      response.ga4Config = ga4Config;
    }

    return response;
  }

  @ApiBody({ type: GameEndDto })
  @Post('end')
  async end(
    @Body() gameEnd: GameEndDto,
    @Req() req: Request,
  ): Promise<
    | string
    | {
        result: string;
        dailyChallengeRewards?: DailyChallengeGameEndRewardDto[];
        dailyChallenges?: DailyChallengePlayerSnapshotDto[];
      }
  > {
    const apiKey = req.headers['x-api-key'] as string;
    const serverType = this.secretService.getServerTypeByApiKey(apiKey);
    const players = gameEnd.players;
    const isParty = players.filter((p) => p.steamId > 0).length >= 2;
    const eligiblePlayers = players.filter((player) => {
      if (player.steamId <= 0) {
        return false;
      }
      if (!this.isEligibleForBaseSettlement(player.steamId, player.battlePoints)) {
        logger.warn('game/end: invalid battlePoints, skip upsert', {
          steamId: player.steamId,
          serverType,
          battlePoints: player.battlePoints,
        });
        return false;
      }
      return true;
    });
    await Promise.all(
      eligiblePlayers.map((player) =>
        this.playerService.upsertGameEnd(
          player.steamId,
          player.teamId == gameEnd.winnerTeamId,
          player.battlePoints,
          player.isDisconnected,
          isParty,
        ),
      ),
    );

    let dailyChallengeRewards: DailyChallengeGameEndRewardDto[] = [];
    let dailyChallenges: DailyChallengePlayerSnapshotDto[] = [];
    if (gameEnd.dailyChallenge) {
      const challengeEligiblePlayers = eligiblePlayers.filter((player) => !player.isDisconnected);
      const challengeNow = new Date();
      try {
        const challengeResult = await this.dailyChallengeProgressService.applyGameEnd(
          gameEnd.matchId,
          gameEnd.dailyChallenge,
          challengeEligiblePlayers.map(({ steamId, heroName }) => ({ steamId, heroName })),
          challengeNow,
        );
        dailyChallengeRewards = challengeResult.rewards;
        try {
          dailyChallenges = await this.dailyChallengePlayerService.getSnapshots(
            challengeEligiblePlayers.map(({ steamId }) => steamId),
            challengeNow,
          );
        } catch (error) {
          logger.warn('game/end: daily challenge snapshots unavailable', { error });
        }
      } catch (error) {
        logger.warn('game/end: daily challenge progress unavailable', { error });
      }
    }

    await Promise.all([
      this.analyticsService.gameEndMatch(gameEnd, serverType),
      this.analyticsService.gameEndPlayerBot(gameEnd, serverType),
      ...players.map((p) =>
        this.playerStatsLifetimeService.accumulate(p.steamId, p, {
          matchId: gameEnd.matchId,
          gameOptions: gameEnd.gameOptions,
        }),
      ),
    ]);
    const result = this.gameService.getOK();
    if (dailyChallengeRewards.length === 0 && dailyChallenges.length === 0) {
      return result;
    }
    return {
      result,
      ...(dailyChallengeRewards.length > 0 ? { dailyChallengeRewards } : {}),
      ...(dailyChallenges.length > 0 ? { dailyChallenges } : {}),
    };
  }

  private isEligibleForBaseSettlement(steamId: number, battlePoints: number): boolean {
    return steamId > 0 && battlePoints >= 0 && battlePoints <= 500;
  }
}
