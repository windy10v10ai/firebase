import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  ParseArrayPipe,
  ParseIntPipe,
  Query,
  UseFilters,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { AnalyticsService } from '../analytics/analytics.service';
import { GameEndDto } from '../analytics/dto/game-end-dto';
import { RefreshDailyTaskDto } from '../daily-task/dto/refresh-daily-task.dto';
import { DailyTaskService } from '../daily-task/services/daily-task.service';
import { ProbeResponse } from '../game/dto/probe.response';
import { GameService } from '../game/game.service';
import { LocalHostService } from '../local-host/local-host.service';
import { PlayerInfoInclude } from '../player-info/assemblers/player-dto.assembler';
import { PlayerInfoDto } from '../player-info/dto/player-info.dto';
import { PlayerInfoService } from '../player-info/player-info.service';
import { AllowLocal } from '../util/auth/allow-local.decorator';
import { AllowQueryKey } from '../util/auth/allow-query-key.decorator';
import { ClientOrigin, CurrentClientOrigin } from '../util/auth/client-origin.decorator';
import { CurrentServerType } from '../util/auth/server-type.decorator';
import { SERVER_TYPE } from '../util/secret/secret.service';

import { ProxyExceptionFilter } from './proxy-exception.filter';
import { decodeProxyBody } from './proxy-request.util';
import { buildProxySuccessHtml, validateRequestId } from './proxy-response.util';

// 游廊多人对局发不出 HTTP 请求，由代发玩家的客户端网页控件代为访问，
// 每个玩家拆成 game-start、player-info 两个并行请求，回来后按字段浅合并
const PROXY_GAME_START_INCLUDE: PlayerInfoInclude[] = ['member', 'setting', 'statsLifetime'];

// title 上限 4096，五天历史留出约三成余量给候选对象以后新增的字段
const PROXY_DAILY_TASK_HISTORY_DAYS = 5;

@ApiExcludeController()
@AllowLocal()
@AllowQueryKey()
@UseFilters(ProxyExceptionFilter)
@Controller('proxy')
export class ProxyController {
  constructor(
    private readonly gameService: GameService,
    private readonly analyticsService: AnalyticsService,
    private readonly playerInfoService: PlayerInfoService,
    private readonly localHostService: LocalHostService,
    private readonly dailyTaskService: DailyTaskService,
  ) {}

  // 对应 GET /game/probe
  @Get('game-probe')
  gameProbe(
    @Query('requestId') requestId: string,
    @CurrentClientOrigin() origin: ClientOrigin,
  ): string {
    validateRequestId(requestId);
    const body: ProbeResponse = { country: origin.country };
    return buildProxySuccessHtml(requestId, body);
  }

  // 对应 GET /game/start
  @Get('game-start')
  async gameStart(
    @Query('requestId') requestId: string,
    @Query('steamIds', new ParseArrayPipe({ items: Number, separator: ',' }))
    steamIds: number[],
    @Query('matchId', new ParseIntPipe()) matchId: number,
    @Query('version') version: string,
    @CurrentServerType() serverType: SERVER_TYPE,
  ): Promise<string> {
    validateRequestId(requestId);
    const result = await this.gameService.start(
      steamIds,
      matchId,
      version,
      serverType,
      PROXY_GAME_START_INCLUDE,
    );
    return buildProxySuccessHtml(requestId, result);
  }

  // 对应 GET /daily-task/:steamId。只回最近几天历史，今日部分开局时已下发，不重复占 title
  @Get('daily-task')
  async dailyTask(
    @Query('requestId') requestId: string,
    @Query('steamId', ParseIntPipe) steamId: number,
  ): Promise<string> {
    validateRequestId(requestId);
    const { history = [] } = await this.dailyTaskService.getSnapshotWithHistory(steamId);
    return buildProxySuccessHtml(requestId, {
      steamId,
      history: history.slice(0, PROXY_DAILY_TASK_HISTORY_DAYS),
    });
  }

  // 对应 POST /daily-task/refresh
  @Get('daily-task-refresh-post')
  async dailyTaskRefreshPost(
    @Query('requestId') requestId: string,
    @Query('body') body: string,
  ): Promise<string> {
    validateRequestId(requestId);
    const dto = await decodeProxyBody(RefreshDailyTaskDto, body);
    const snapshot = await this.dailyTaskService.refresh(dto.steamId, dto.dayId);
    return buildProxySuccessHtml(requestId, snapshot);
  }

  // 对应 GET /player/:steamId/info
  @Get('player-info')
  async playerInfo(
    @Query('requestId') requestId: string,
    @Query('steamId', ParseIntPipe) steamId: number,
    @Query('include', new ParseArrayPipe({ items: String, separator: ',', optional: true }))
    include: PlayerInfoInclude[] = [],
  ): Promise<string> {
    validateRequestId(requestId);
    // 新玩家可能还没经过 game-start 建档，把「查无此人」当成「没有可选字段」，不算失败
    const player = await this.findPlayerInfoOrUndefined(steamId, include);
    return buildProxySuccessHtml(requestId, player ?? {});
  }

  // 对应 POST /game/end/local。一条请求只带一个玩家，逐人过限额与冷却；
  // 整场事件 gameEndMatch 凑不齐全场数据，不在这条路径上发，只发按玩家的 gameEndPlayerBot
  @Get('game-end-local-post')
  async gameEndLocalPost(
    @Query('requestId') requestId: string,
    @Query('body') body: string,
    @CurrentClientOrigin() origin: ClientOrigin,
    @CurrentServerType() serverType: SERVER_TYPE,
  ): Promise<string> {
    validateRequestId(requestId);
    const gameEnd = await decodeProxyBody(GameEndDto, body);
    if (gameEnd.players.length !== 1) {
      throw new BadRequestException();
    }
    const recorded = await this.localHostService.recordGameEnd(gameEnd, origin);
    if (recorded) {
      await this.gameService.recordPlayerStats(gameEnd);
      await this.analyticsService.gameEndPlayerBot(gameEnd, serverType);
    }
    return buildProxySuccessHtml(requestId, { recorded });
  }

  private async findPlayerInfoOrUndefined(
    steamId: number,
    include: PlayerInfoInclude[],
  ): Promise<PlayerInfoDto | undefined> {
    try {
      return await this.playerInfoService.findPlayerInfoBySteamId(steamId, include);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return undefined;
      }
      throw error;
    }
  }
}
