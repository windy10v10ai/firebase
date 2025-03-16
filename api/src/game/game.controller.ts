import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseArrayPipe,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';

import { AnalyticsService } from '../analytics/analytics.service';
import { GameEndDto } from '../analytics/dto/game-end-dto';
import { MemberDto } from '../members/dto/member.dto';
import { MembersService } from '../members/members.service';
import { PlayerService } from '../player/player.service';
import { UpdatePlayerPropertyDto } from '../player-property/dto/update-player-property.dto';
import { PlayerPropertyService } from '../player-property/player-property.service';
import { Public } from '../util/auth/public.decorator';

import { GameResetPlayerProperty } from './dto/game-reset-player-property';
import { GameStart } from './dto/game-start.response';
import { PlayerDto } from './dto/player.dto';
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
  ) {}

  @Public()
  @Get('start')
  async start(
    @Query('steamIds', new ParseArrayPipe({ items: Number, separator: ',' }))
    steamIds: number[],
    @Query('matchId', new ParseIntPipe()) matchId: number,
    @Headers('x-country-code') countryCode: string,
    @Headers('x-api-key') apiKey: string,
  ): Promise<GameStart> {
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
    await this.analyticsService.gameStart(steamIds, matchId, countryCode, isLocal);

    // ----------------- 以下为返回数据 -----------------
    // 获取玩家信息
    const steamIdsStr = steamIds.map((id) => id.toString());
    const players = await this.gameService.findPlayerDtoBySteamIds(steamIdsStr);

    return {
      members: members.map((m) => new MemberDto(m)),
      players,
      pointInfo,
    };
  }

  @ApiBody({ type: GameEndDto })
  @Post('end')
  async end(@Body() gameEnd: GameEndDto): Promise<string> {
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

    await this.analyticsService.gameEndMatch(gameEnd);
    await this.analyticsService.gameEndPlayerBot(gameEnd);
    return this.gameService.getOK();
  }

  @Put('addPlayerProperty')
  async addPlayerProperty(
    @Body() updatePlayerPropertyDto: UpdatePlayerPropertyDto,
  ): Promise<PlayerDto> {
    await this.playerPropertyService.update(updatePlayerPropertyDto);

    return await this.gameService.findPlayerDtoBySteamId(updatePlayerPropertyDto.steamId);
  }

  @Post('resetPlayerProperty')
  async resetPlayerProperty(@Body() gameResetPlayerProperty: GameResetPlayerProperty) {
    await this.gameService.resetPlayerProperty(gameResetPlayerProperty);
    await this.analyticsService.playerResetProperty(gameResetPlayerProperty);

    return await this.gameService.findPlayerDtoBySteamId(gameResetPlayerProperty.steamId);
  }

  @Get('player/steamId/:steamId')
  async getPlayerInfo(@Param('steamId') steamId: number): Promise<PlayerDto> {
    return await this.gameService.findPlayerDtoBySteamId(steamId);
  }
}
