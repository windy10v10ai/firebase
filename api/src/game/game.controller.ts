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
import { DailyTaskService } from '../daily-task/services/daily-task.service';
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

const MAX_BATTLE_POINTS_PER_MATCH = 500;

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
    private readonly dailyTaskService: DailyTaskService,
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
    const response: GameStart = {
      players,
      pointInfo,
    };

    const dailyTasks = await this.dailyTaskService.getSnapshots(steamIds);
    if (dailyTasks.length > 0) {
      response.dailyTasks = dailyTasks;
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
  async end(@Body() gameEnd: GameEndDto, @Req() req: Request): Promise<string> {
    const apiKey = req.headers['x-api-key'] as string;
    const serverType = this.secretService.getServerTypeByApiKey(apiKey);
    const players = gameEnd.players;
    const isParty = players.filter((p) => p.steamId > 0).length >= 2;
    await Promise.all(
      players.map((player) => {
        if (player.steamId <= 0) {
          return undefined;
        }
        const battlePoints = Number.isFinite(player.battlePoints) ? player.battlePoints : 0;
        if (battlePoints > MAX_BATTLE_POINTS_PER_MATCH) {
          logger.warn('game/end: battlePoints exceeds cap, truncating', {
            steamId: player.steamId,
            serverType,
            battlePoints,
          });
        } else if (battlePoints < 0) {
          logger.warn('game/end: negative battlePoints, clamping to zero', {
            steamId: player.steamId,
            serverType,
            battlePoints,
          });
        }
        const settledPoints = Math.min(MAX_BATTLE_POINTS_PER_MATCH, Math.max(0, battlePoints));
        return this.playerService.upsertGameEnd(
          player.steamId,
          player.teamId == gameEnd.winnerTeamId,
          settledPoints,
          player.isDisconnected,
          isParty,
        );
      }),
    );

    await this.dailyTaskService.recordGameEnd(players);

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
    return this.gameService.getOK();
  }
}
