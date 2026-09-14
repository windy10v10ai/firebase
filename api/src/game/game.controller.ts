import { Body, Controller, Get, ParseArrayPipe, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';

import { AnalyticsService } from '../analytics/analytics.service';
import { GameEndDto } from '../analytics/dto/game-end-dto';
import { DailyTaskService } from '../daily-task/services/daily-task.service';
import { LocalHostService } from '../local-host/local-host.service';
import { MembersService } from '../members/members.service';
import { PlayerInfoService } from '../player-info/player-info.service';
import { AllowLocal } from '../util/auth/allow-local.decorator';
import { ClientOrigin, CurrentClientOrigin } from '../util/auth/client-origin.decorator';
import { CurrentServerType } from '../util/auth/server-type.decorator';
import { SERVER_TYPE } from '../util/secret/secret.service';

import { GameStart } from './dto/game-start.response';
import { PointInfoDto } from './dto/point-info.dto';
import { GameService } from './game.service';

@ApiTags('Game')
@Controller('game')
export class GameController {
  constructor(
    private readonly gameService: GameService,
    private readonly membersService: MembersService,
    private readonly analyticsService: AnalyticsService,
    private readonly playerInfoService: PlayerInfoService,
    private readonly dailyTaskService: DailyTaskService,
    private readonly localHostService: LocalHostService,
  ) {}

  @AllowLocal()
  @Get('start')
  async start(
    @Query('steamIds', new ParseArrayPipe({ items: Number, separator: ',' }))
    steamIds: number[],
    @Query('matchId', new ParseIntPipe()) matchId: number,
    @Query('version') version: string,
    @CurrentServerType() serverType: SERVER_TYPE,
  ): Promise<GameStart> {
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
  async end(
    @Body() gameEnd: GameEndDto,
    @CurrentServerType() serverType: SERVER_TYPE,
  ): Promise<string> {
    await this.gameService.recordGameEnd(gameEnd);
    await this.gameService.recordMatchStats(gameEnd, serverType);
    return this.gameService.getOK();
  }

  // 本地主机受限结算：带限额与冷却，且不计算行为分。官方来源不会走这条路，
  // 真走了也只是拿到更严格的结算，没有损失，所以不额外区分来源。
  @AllowLocal()
  @ApiBody({ type: GameEndDto })
  @Post('end/local')
  async endLocal(
    @Body() gameEnd: GameEndDto,
    @CurrentServerType() serverType: SERVER_TYPE,
    @CurrentClientOrigin() origin: ClientOrigin,
  ): Promise<string> {
    const recorded = await this.localHostService.recordGameEnd(gameEnd, origin);
    if (recorded) {
      await this.gameService.recordMatchStats(gameEnd, serverType);
    }
    return this.gameService.getOK();
  }
}
