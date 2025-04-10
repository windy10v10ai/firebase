import { Injectable } from '@nestjs/common';

import { PlayerPropertyService } from '../player-property/player-property.service';

import { PlayerDto } from './dto/player.dto';
import { PlayerSettingService } from './player-setting.service';
import { PlayerService } from './player.service';

@Injectable()
export class PlayerDtoService {
  constructor(
    private readonly playerService: PlayerService,
    private readonly playerPropertyService: PlayerPropertyService,
    private readonly playerSettingService: PlayerSettingService,
  ) {}

  async findPlayerDtoBySteamId(steamId: number): Promise<PlayerDto> {
    const players = await this.findPlayerDtoBySteamIds([steamId.toString()]);
    return players[0];
  }

  async findPlayerDtoBySteamIds(ids: string[]): Promise<PlayerDto[]> {
    const players = (await this.playerService.findByIds(ids)) as PlayerDto[];
    for (const player of players) {
      const properties = await this.playerPropertyService.findBySteamId(+player.id);
      if (properties) {
        player.properties = properties;
      } else {
        player.properties = [];
      }
      const setting = await this.playerSettingService.getPlayerSettingOrGenerateDefault(player.id);
      player.playerSetting = setting;

      const seasonPoint = player.seasonPointTotal;
      const seasonLevel = this.playerService.getSeasonLevelBuyPoint(seasonPoint);
      player.seasonLevel = seasonLevel;
      player.seasonCurrrentLevelPoint =
        seasonPoint - this.playerService.getSeasonTotalPoint(seasonLevel);
      player.seasonNextLevelPoint = this.playerService.getSeasonNextLevelPoint(seasonLevel);

      const memberPoint = player.memberPointTotal;
      const memberLevel = this.playerService.getMemberLevelBuyPoint(memberPoint);
      player.memberLevel = memberLevel;
      player.memberCurrentLevelPoint =
        memberPoint - this.playerService.getMemberTotalPoint(memberLevel);
      player.memberNextLevelPoint = this.playerService.getMemberNextLevelPoint(memberLevel);
      player.totalLevel = seasonLevel + memberLevel;

      const usedLevel = player.properties.reduce((prev, curr) => prev + curr.level, 0);
      player.useableLevel = player.totalLevel - usedLevel;
    }
    return players;
  }
}
