import { Injectable } from '@nestjs/common';

import { GameResetPlayerProperty } from '../game/dto/game-reset-player-property';
import { SECRET, SecretService } from '../util/secret/secret.service';

import { PurchaseEvent } from './analytics.purchase.service';
import { GetHeroId, GetHeroNameChinese } from './data/hero-data';
import { GameEndDto as GameEndMatchDto, GameEndPlayerDto } from './dto/game-end-dto';
import { PickDto } from './dto/pick-ability-dto';
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

  async gameStart(steamIds: number[], matchId: number, countryCode: string, isLocal: boolean) {
    for (const steamId of steamIds) {
      const event = await this.buildEvent('game_load', steamId, matchId.toString(), {
        steam_id: steamId,
        match_id: matchId,
        country: countryCode,
        is_local: isLocal,
      });

      const userProperties: UserProperties = {
        country: {
          value: countryCode,
        },
      };

      await this.sendEvent(steamId.toString(), event, userProperties);
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

  async lotteryPickAbility(pickDto: PickDto) {
    const event = await this.buildEvent('lottery_pick_ability', pickDto.steamId, pickDto.matchId, {
      steam_id: pickDto.steamId,
      match_id: pickDto.matchId,
      ability_name: pickDto.name,
      type: pickDto.type,
      level: pickDto.level,
      difficulty: pickDto.difficulty,
      version: pickDto.version,
    });

    await this.sendEvent(pickDto.steamId.toString(), event);
  }

  async gameEndPickAbility(pickDto: PickDto) {
    const event = await this.buildEvent('game_end_pick_ability', pickDto.steamId, pickDto.matchId, {
      steam_id: pickDto.steamId,
      match_id: pickDto.matchId,
      ability_name: pickDto.name,
      type: pickDto.type,
      level: pickDto.level,
      difficulty: pickDto.difficulty,
      version: pickDto.version,
      win_metrics: pickDto.isWin,
    });

    await this.sendEvent(pickDto.steamId.toString(), event);
  }

  // ------------------------ 通过game end API调用 ------------------------
  async gameEndPlayerBot(gameEnd: GameEndMatchDto) {
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
        is_disconnect: player.isDisconnected,
      });

      await this.sendEvent(player.steamId.toString(), event);
    }
  }

  async gameEndMatch(gameEnd: GameEndMatchDto) {
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

  async trackPlayerLanguage(dto: PlayerLanguageListDto) {
    for (const player of dto.players) {
      const event = await this.buildEvent('player_language', player.steamId, '0', {
        steam_id: player.steamId,
        language: player.language,
      });

      const userProperties = {
        language: {
          value: player.language,
        },
      };

      await this.sendEvent(player.steamId.toString(), event, userProperties);
    }
  }
}
