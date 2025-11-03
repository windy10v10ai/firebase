import { Injectable } from '@nestjs/common';

import { GameResetPlayerProperty } from '../game/dto/game-reset-player-property';
import { SECRET, SERVER_TYPE, SecretService } from '../util/secret/secret.service';

import { PurchaseEvent } from './analytics.purchase.service';
import { GetHeroId, GetHeroNameChinese } from './data/hero-data';
import { GameEndDto as GameEndMatchDto, GameEndPlayerDto } from './dto/game-end-dto';
import { PickListDto } from './dto/pick-ability-dto';
import { ItemListDto } from './dto/pick-item-dto';
import { PlayerLanguageListDto } from './dto/player-language-dto';

export interface Event {
  name: string;
  params: {
    [key: string]: number | string | boolean;
    session_id?: number | string;
    session_number?: number;
    engagement_time_msec?: number | string;
    debug_mode?: boolean;
  };
}

interface UserProperties {
  country?: {
    value: string;
  };
  language?: {
    value: string;
  };
}

@Injectable()
export class AnalyticsService {
  private readonly measurementProtocolUrl = 'https://www.google-analytics.com/mp/collect';
  private readonly measurementId = process.env.GA_MEASUREMENT_ID;

  constructor(private readonly secretService: SecretService) {}

  async playerCreate(steamId: number) {
    const event = await this.buildEvent('new_player', steamId, '0', {
      steam_id: steamId,
    });

    await this.sendEvent(steamId.toString(), event);
  }

  async gameStart(steamIds: number[], matchId: number, isLocal: boolean, serverType: SERVER_TYPE) {
    for (const steamId of steamIds) {
      const event = await this.buildEvent('game_load', steamId, matchId.toString(), {
        steam_id: steamId,
        match_id: matchId,
        is_local: isLocal,
        server_type: serverType,
      });

      await this.sendEvent(steamId.toString(), event);
    }
  }

  async playerResetProperty(dto: GameResetPlayerProperty): Promise<void> {
    await this.sendEvent(dto.steamId.toString(), {
      name: 'player_reset_property',
      params: {
        steam_id: dto.steamId,
        use_member_point: dto.useMemberPoint,
      },
    });
  }

  async gameEndPickAbilities(dto: PickListDto, serverType: SERVER_TYPE) {
    for (const pick of dto.picks) {
      const event = await this.buildEvent('game_end_pick_ability', pick.steamId, dto.matchId, {
        steam_id: pick.steamId,
        match_id: dto.matchId,
        ability_name: pick.name,
        type: pick.type,
        level: pick.level,
        difficulty: dto.difficulty,
        version: dto.version,
        win_metrics: dto.isWin,
        server_type: serverType,
      });

      await this.sendEvent(pick.steamId.toString(), event);
    }
  }

  async gameEndItemBuilds(dto: ItemListDto, serverType: SERVER_TYPE) {
    // 遍历每个玩家的物品数据
    for (const playerItems of dto.items) {
      const itemSlots = [
        { name: playerItems.slot1, type: 'normal' },
        { name: playerItems.slot2, type: 'normal' },
        { name: playerItems.slot3, type: 'normal' },
        { name: playerItems.slot4, type: 'normal' },
        { name: playerItems.slot5, type: 'normal' },
        { name: playerItems.slot6, type: 'normal' },
        { name: playerItems.neutralActiveSlot, type: 'neutral_active' },
        { name: playerItems.neutralPassiveSlot, type: 'neutral_passive' },
      ];

      // 逐个发送物品事件到GA
      for (const slot of itemSlots) {
        if (slot.name) {
          // 只发送非空的物品槽位
          const event = await this.buildEvent(
            'game_end_item_build',
            playerItems.steamId,
            dto.matchId,
            {
              steam_id: playerItems.steamId,
              match_id: dto.matchId,
              item_name: slot.name,
              type: slot.type,
              difficulty: dto.difficulty,
              version: dto.version,
              win_metrics: dto.isWin,
              server_type: serverType,
            },
          );

          await this.sendEvent(playerItems.steamId.toString(), event);
        }
      }
    }
  }

  async trackPlayerLanguage(dto: PlayerLanguageListDto, serverType: SERVER_TYPE) {
    for (const player of dto.players) {
      const event = await this.buildEvent('player_language', player.steamId, dto.matchId, {
        steam_id: player.steamId,
        language: player.language,
        version: dto.version,
        server_type: serverType,
      });

      const userProperties = {
        language: {
          value: player.language,
        },
      };

      await this.sendEvent(player.steamId.toString(), event, userProperties);
    }
  }

  // ------------------------ 通过game end API调用 ------------------------
  async gameEndPlayerBot(gameEnd: GameEndMatchDto, serverType: SERVER_TYPE) {
    const playerCount = gameEnd.players.filter((player) => player.steamId > 0).length;
    for (const player of gameEnd.players) {
      const eventName = player.steamId === 0 ? 'game_end_bot' : 'game_end_player';
      // 机器人不纳入互动时间统计
      const engagement_time_msec = player.steamId === 0 ? undefined : gameEnd.gameTimeMsec;

      const event = await this.buildEvent(eventName, player.steamId, gameEnd.matchId, {
        steam_id: player.steamId,
        matchId: gameEnd.matchId,
        engagement_time_msec,
        difficulty: gameEnd.difficulty,
        version: gameEnd.version,
        player_count: playerCount,
        is_winner: gameEnd.winnerTeamId === player.teamId,
        win_metrics: gameEnd.winnerTeamId === player.teamId,
        team_id: player.teamId,
        hero_name: player.heroName,
        hero_name_cn: GetHeroNameChinese(player.heroName),
        points: player.battlePoints,
        facet_id: player.facetId,
        is_disconnect: player.isDisconnected,
        server_type: serverType,
        country: gameEnd.countryCode,
      });

      const userProperties: UserProperties = {};

      if (player.steamId > 0 && gameEnd.countryCode) {
        userProperties.country = {
          value: gameEnd.countryCode,
        };
      }

      await this.sendEvent(player.steamId.toString(), event, userProperties);
    }
  }

  async gameEndMatch(gameEnd: GameEndMatchDto, serverType: SERVER_TYPE) {
    const gameOptions = gameEnd.gameOptions;
    const gameOptionsObject = {
      mr: gameOptions.multiplierRadiant,
      md: gameOptions.multiplierDire,
      pnr: gameOptions.playerNumberRadiant,
      pnd: gameOptions.playerNumberDire,
      tp: gameOptions.towerPowerPct,
    };
    const gameOptionsJson = JSON.stringify(gameOptionsObject);

    const eventParams: { [key: string]: number | string | boolean } = {
      match_id: gameEnd.matchId,
      version: gameEnd.version,
      difficulty: gameEnd.difficulty,
      game_options: gameOptionsJson,
      winner_team_id: gameEnd.winnerTeamId,
      server_type: serverType,
    };

    gameEnd.players.forEach((player, i) => {
      eventParams[`player_${i + 1}`] = this.buildPlayerJson(player);
    });

    const event = await this.buildEvent(
      'game_end_match',
      gameEnd.steamId,
      gameEnd.matchId,
      eventParams,
    );
    await this.sendEvent('system', event);
  }

  private buildPlayerJson(player: GameEndPlayerDto) {
    const playerObject = {
      hi: GetHeroId(player.heroName),
      si: player.steamId,
      ti: player.teamId,
      dc: player.isDisconnected ? 1 : 0,
      l: player.level,
      g: player.gold,
      k: player.kills,
      d: player.deaths,
      a: player.assists,
      p: player.score,
    };
    const playerJson = JSON.stringify(playerObject);
    return playerJson;
  }

  // ---------------------------- common ----------------------------
  async buildEvent(
    eventName: string,
    steamId: number,
    matchId: string,
    eventParams: { [key: string]: number | string | boolean },
  ) {
    const event: Event = {
      name: eventName,
      params: {
        ...eventParams,
        session_id: `${steamId}-${matchId}`,
        session_number: Number(matchId),
        engagement_time_msec: (eventParams.engagement_time_msec as number | string) || 1000,
        debug_mode: process.env.ENVIRONMENT === 'local',
      },
    };

    return event;
  }

  async sendEvent(userId: string, event: Event | PurchaseEvent, userProperties?: UserProperties) {
    // 在e2e测试环境中跳过发送GA4事件
    if (process.env.NODE_ENV === 'test') {
      return true;
    }

    const apiSecret = this.secretService.getSecretValue(SECRET.GA4_API_SECRET);

    const payload = {
      client_id: userId,
      user_id: userId,
      non_personalized_ads: false,
      events: [event],
      user_properties: userProperties,
    };

    const response = await fetch(
      `${this.measurementProtocolUrl}?measurement_id=${this.measurementId}&api_secret=${apiSecret}`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );

    return response.status === 204;
  }
}
