import { Injectable } from '@nestjs/common';

import { PlayerService } from '../player/player.service';

import { PlayerDtoAssembler } from './assemblers/player-dto.assembler';
import { PlayerDto } from './dto/player.dto';

@Injectable()
export class PlayerInfoService {
  constructor(
    private readonly playerService: PlayerService,
    private readonly playerDtoAssembler: PlayerDtoAssembler,
  ) {}

  /**
   * 根据 Steam ID 查找单个 PlayerDto
   * @param steamId Steam ID
   * @returns PlayerDto
   */
  async findPlayerDtoBySteamId(steamId: number): Promise<PlayerDto> {
    const players = await this.findPlayerDtoBySteamIds([steamId.toString()]);
    return players[0];
  }

  /**
   * 根据 Steam ID 列表查找多个 PlayerDto
   * @deprecated 此方法将在未来版本中移除，请使用 findPlayerInfoBySteamIds 替代
   * @param ids Steam ID 字符串数组
   * @returns PlayerDto 数组
   */
  async findPlayerDtoBySteamIds(ids: string[]): Promise<PlayerDto[]> {
    const players = await this.playerService.findByIds(ids);
    return Promise.all(players.map((player) => this.playerDtoAssembler.assemblePlayerDto(player)));
  }
}
