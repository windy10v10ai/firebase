import { Injectable, NotFoundException } from '@nestjs/common';

import { LocalHostService } from '../local-host/local-host.service';
import { UsePlayerMemberPointsDto } from '../player/dto/use-player-member-points.dto';
import { PlayerService } from '../player/player.service';
import { ClientOrigin } from '../util/auth/client-origin.decorator';
import { SERVER_TYPE } from '../util/secret/secret.service';

import { PlayerDtoAssembler, PlayerInfoInclude } from './assemblers/player-dto.assembler';
import { PlayerInfoDto } from './dto/player-info.dto';

const PRIVATE_FIELDS = [
  'useableSeasonPoint',
  'useableMemberPoint',
  'usedSeasonPoint',
  'usedMemberPoint',
  'conductPoint',
  'disconnectCount',
  'lastMatchTime',
  'checkIn',
] as const;

@Injectable()
export class PlayerInfoService {
  constructor(
    private readonly playerService: PlayerService,
    private readonly playerDtoAssembler: PlayerDtoAssembler,
    private readonly localHostService: LocalHostService,
  ) {}

  async findPlayerInfoBySteamId(
    steamId: number,
    include: PlayerInfoInclude[],
  ): Promise<PlayerInfoDto> {
    const player = await this.playerService.findBySteamId(steamId);
    if (!player) throw new NotFoundException();
    return this.playerDtoAssembler.assemblePlayerInfoDto(player, include);
  }

  /** 访客看到的玩家信息：去掉积分余额、行为分、会员有效期等只给本人的字段 */
  async findPublicPlayerInfoBySteamId(
    steamId: number,
    include: PlayerInfoInclude[],
  ): Promise<PlayerInfoDto> {
    const dto = await this.findPlayerInfoBySteamId(
      steamId,
      include.filter((item) => item !== 'setting'),
    );
    for (const field of PRIVATE_FIELDS) {
      delete dto[field];
    }
    if (dto.member) {
      delete dto.member.expireDateString;
    }
    return dto;
  }

  async findPlayerInfoBySteamIds(
    steamIds: string[],
    include: PlayerInfoInclude[],
  ): Promise<PlayerInfoDto[]> {
    const players = await this.playerService.findByIds(steamIds);
    return Promise.all(
      players.map((player) => this.playerDtoAssembler.assemblePlayerInfoDto(player, include)),
    );
  }

  /** 扣会员积分并返回扣后的玩家信息，本地主机来源先过每日限额。 */
  async useMemberPoint(
    dto: UsePlayerMemberPointsDto,
    serverType: SERVER_TYPE,
    origin: ClientOrigin,
  ): Promise<PlayerInfoDto> {
    const isLocal = serverType === SERVER_TYPE.LOCAL;
    if (isLocal) {
      const withinLimit = await this.localHostService.checkMemberPointLimit(
        dto.steamId,
        dto.memberPoint,
        origin,
      );
      // 客户端不管成功失败都会刷新玩家数据，碰到每日上限回报错只会换来一次重试
      if (!withinLimit) {
        return this.findPlayerInfoBySteamId(dto.steamId, []);
      }
    }

    await this.playerService.useMemberPoint(dto, serverType);

    // 扣分失败会先抛出，所以记账放在成功之后，失败不占额度
    if (isLocal) {
      await this.localHostService.recordMemberPointUsage(
        dto.steamId,
        dto.memberPoint,
        dto.reason,
        origin,
      );
    }

    return this.findPlayerInfoBySteamId(dto.steamId, []);
  }
}
