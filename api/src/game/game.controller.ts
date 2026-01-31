import {
  Body,
  Controller,
  Get,
  Param,
  ParseArrayPipe,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';

import { AnalyticsService } from '../analytics/analytics.service';
import { GameEndDto } from '../analytics/dto/game-end-dto';
import { MemberDto } from '../members/dto/member.dto';
import { MembersService } from '../members/members.service';
import { PlayerDto } from '../player/dto/player.dto';
import { PlayerService } from '../player/player.service';
import { PlayerInfoService } from '../player-info/player-info.service';
import { UpdatePlayerPropertyDto } from '../player-property/dto/update-player-property.dto';
import { PlayerPropertyService } from '../player-property/player-property.service';
import { Public } from '../util/auth/public.decorator';
import { SecretService } from '../util/secret/secret.service';

import { GameResetPlayerProperty } from './dto/game-reset-player-property';
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
    private readonly playerPropertyService: PlayerPropertyService,
    private readonly analyticsService: AnalyticsService,
    private readonly secretService: SecretService,
    private readonly playerInfoService: PlayerInfoService,
  ) {}

  @Public()
  @Get('start')
  async start(
    @Query('steamIds', new ParseArrayPipe({ items: Number, separator: ',' }))
    steamIds: number[],
    @Query('matchId', new ParseIntPipe()) matchId: number,
    @Req() req: Request,
  ): Promise<GameStart> {
    const apiKey = req.headers['x-api-key'] as string;
    steamIds = this.gameService.validateSteamIds(steamIds);

    const pointInfo: PointInfoDto[] = [];

    // 创建新玩家，更新最后游戏时间
    for (const steamId of steamIds) {
      await this.gameService.upsertPlayerInfo(steamId);
    }

    // 获取活动奖励
    const eventRewardInfo = await this.gameService.giveEventReward(steamIds);
    pointInfo.push(...eventRewardInfo);

    // 获取会员 添加每日会员积分
    const members = await this.membersService.findBySteamIds(steamIds);
    // 添加每日会员积分
    const memberDailyPointInfo = await this.gameService.addDailyMemberPoints(members);
    pointInfo.push(...memberDailyPointInfo);

    // ----------------- 以下为统计数据 -----------------
    // 统计数据发送至GA4
    const isLocal = apiKey === 'Invalid_NotOnDedicatedServer';
    const serverType = this.secretService.getServerTypeByApiKey(apiKey);
    await this.analyticsService.gameStart(steamIds, matchId, isLocal, serverType);

    // ----------------- 以下为返回数据 -----------------
    // 获取玩家信息
    const steamIdsStr = steamIds.map((id) => id.toString());
    const players = await this.playerInfoService.findPlayerDtoBySteamIds(steamIdsStr);

    // 构建响应对象
    const response: GameStart = {
      members: members.map((m) => new MemberDto(m)),
      players,
      pointInfo,
    };

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
    const players = gameEnd.players;
    for (const player of players) {
      if (player.steamId > 0) {
        const battlePoints = player.battlePoints;
        if (battlePoints < 0 || battlePoints > 1000) {
          // 异常数值，不更新
          continue;
        }
        await this.playerService.upsertGameEnd(
          player.steamId,
          player.teamId == gameEnd.winnerTeamId,
          player.battlePoints,
          player.isDisconnected,
        );
      }
    }

    const serverType = this.secretService.getServerTypeByApiKey(apiKey);
    await this.analyticsService.gameEndMatch(gameEnd, serverType);
    await this.analyticsService.gameEndPlayerBot(gameEnd, serverType);
    return this.gameService.getOK();
  }

  @ApiOperation({
    summary: 'Get player info (deprecated)',
    description: '此端点已弃用，将在未来版本中移除。请使用新的 PlayerInfo API。',
    deprecated: true,
  })
  @Put('addPlayerProperty')
  async addPlayerProperty(
    @Body() updatePlayerPropertyDto: UpdatePlayerPropertyDto,
  ): Promise<PlayerDto> {
    await this.playerPropertyService.update(updatePlayerPropertyDto);

    return await this.playerInfoService.findPlayerDtoBySteamId(updatePlayerPropertyDto.steamId);
  }

  @ApiOperation({
    summary: 'Get player info (deprecated)',
    description: '此端点已弃用，将在未来版本中移除。请使用新的 PlayerInfo API。',
    deprecated: true,
  })
  @Post('resetPlayerProperty')
  async resetPlayerProperty(@Body() gameResetPlayerProperty: GameResetPlayerProperty) {
    await this.playerInfoService.resetPlayerProperty(
      gameResetPlayerProperty.steamId,
      gameResetPlayerProperty.useMemberPoint,
    );
    await this.analyticsService.playerResetProperty(gameResetPlayerProperty);

    return await this.playerInfoService.findPlayerDtoBySteamId(gameResetPlayerProperty.steamId);
  }

  @ApiOperation({
    summary: 'Get player info (deprecated)',
    description: '此端点已弃用，将在未来版本中移除。请使用新的 PlayerInfo API。',
    deprecated: true,
  })
  @Get('player/steamId/:steamId')
  async getPlayerInfo(@Param('steamId') steamId: number): Promise<PlayerDto> {
    return await this.playerInfoService.findPlayerDtoBySteamId(steamId);
  }
}
