import { Injectable } from '@nestjs/common';

import { PlayerService } from '../player/player.service';

import { PlayerDtoAssembler, PlayerInfoInclude } from './assemblers/player-dto.assembler';
import { PlayerInfoDto } from './dto/player-info.dto';

@Injectable()
export class PlayerInfoService {
  constructor(
    private readonly playerService: PlayerService,
    private readonly playerDtoAssembler: PlayerDtoAssembler,
  ) {}

  async findPlayerInfoBySteamId(
    steamId: number,
    include: PlayerInfoInclude[],
  ): Promise<PlayerInfoDto> {
    const player = await this.playerService.findBySteamId(steamId);
    return this.playerDtoAssembler.assemblePlayerInfoDto(player, include);
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
}
