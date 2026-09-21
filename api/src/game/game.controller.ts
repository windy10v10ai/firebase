import { Body, Controller, Get, ParseArrayPipe, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';

import { GameEndDto } from '../analytics/dto/game-end-dto';
import { LocalHostService } from '../local-host/local-host.service';
import { PlayerInfoInclude } from '../player-info/assemblers/player-dto.assembler';
import { AllowLocal } from '../util/auth/allow-local.decorator';
import { ClientOrigin, CurrentClientOrigin } from '../util/auth/client-origin.decorator';
import { CurrentServerType } from '../util/auth/server-type.decorator';
import { SERVER_TYPE } from '../util/secret/secret.service';

import { GameStart } from './dto/game-start.response';
import { ProbeResponse } from './dto/probe.response';
import { GameService } from './game.service';

const GAME_START_INCLUDE: PlayerInfoInclude[] = [
  'member',
  'property',
  'setting',
  'statsLifetime',
  'heroAwakening',
];

@ApiTags('Game')
@Controller('game')
export class GameController {
  constructor(
    private readonly gameService: GameService,
    private readonly localHostService: LocalHostService,
  ) {}

  // 国家码只在玩家直连 API 域名时代表玩家本人；经中转入口回源进来的请求，
  // 边缘看到的是中转服务器，返回的是它所在地
  @AllowLocal()
  @Get('probe')
  probe(@CurrentClientOrigin() origin: ClientOrigin): ProbeResponse {
    return { country: origin.country };
  }

  @AllowLocal()
  @Get('start')
  async start(
    @Query('steamIds', new ParseArrayPipe({ items: Number, separator: ',' }))
    steamIds: number[],
    @Query('matchId', new ParseIntPipe()) matchId: number,
    @Query('version') version: string,
    @CurrentServerType() serverType: SERVER_TYPE,
  ): Promise<GameStart> {
    return this.gameService.start(steamIds, matchId, version, serverType, GAME_START_INCLUDE);
  }

  @ApiBody({ type: GameEndDto })
  @Post('end')
  async end(
    @Body() gameEnd: GameEndDto,
    @CurrentServerType() serverType: SERVER_TYPE,
  ): Promise<string> {
    await this.gameService.recordGameEnd(gameEnd);
    await this.gameService.recordMatchAnalytics(gameEnd, serverType);
    await this.gameService.recordPlayerStats(gameEnd);
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
      await this.gameService.recordMatchAnalytics(gameEnd, serverType);
      await this.gameService.recordPlayerStats(gameEnd);
    }
    return this.gameService.getOK();
  }
}
