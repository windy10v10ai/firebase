import {
  Controller,
  Get,
  NotFoundException,
  ParseArrayPipe,
  ParseIntPipe,
  Query,
  UseFilters,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { GameService } from '../game/game.service';
import { PlayerInfoInclude } from '../player-info/assemblers/player-dto.assembler';
import { PlayerInfoDto } from '../player-info/dto/player-info.dto';
import { PlayerInfoService } from '../player-info/player-info.service';
import { AllowLocal } from '../util/auth/allow-local.decorator';
import { AllowQueryKey } from '../util/auth/allow-query-key.decorator';
import { CurrentServerType } from '../util/auth/server-type.decorator';
import { SERVER_TYPE } from '../util/secret/secret.service';

import { ProxyExceptionFilter } from './proxy-exception.filter';
import { buildProxySuccessHtml, validateRequestId } from './proxy-response.util';

// 本地主机拿不到 HTTP 请求对象时，由代发玩家的客户端网页控件代为访问，
// 每个玩家拆成 game-start、player-info 两个并行请求，回来后按字段浅合并
const PROXY_GAME_START_INCLUDE: PlayerInfoInclude[] = ['member', 'setting', 'statsLifetime'];

@ApiExcludeController()
@AllowLocal()
@AllowQueryKey()
@UseFilters(ProxyExceptionFilter)
@Controller('proxy')
export class ProxyController {
  constructor(
    private readonly gameService: GameService,
    private readonly playerInfoService: PlayerInfoService,
  ) {}

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
