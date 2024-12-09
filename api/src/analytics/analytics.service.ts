import { Injectable } from '@nestjs/common';
import { logger } from 'firebase-functions/v1';

import { GameEndDto } from '../game/dto/game-end.request.body';
import { SECRET, SecretService } from '../util/secret/secret.service';

import { PickDto } from './dto/pick-ability-dto';

interface Event {
  name: string;
  params: {
    [key: string]: number | string | boolean;
    session_id: number | string;
    engagement_time_msec: number | string;
    debug_mode?: boolean;
  };
}

interface UserProperties {
  country?: {
    value: string;
  };
}

@Injectable()
export class AnalyticsService {
  private readonly measurementProtocolUrl = 'https://www.google-analytics.com/mp/collect';
  private readonly measurementId = process.env.GA_MEASUREMENT_ID;

  constructor(private readonly secretService: SecretService) {}

  async gameStart(steamIds: number[], matchId: number) {
    for (const steamId of steamIds) {
      const event = await this.buildPlayerEvent('player_game_start', steamId, matchId.toString(), {
        method: 'steam',
        steam_id: steamId,
        match_id: matchId,
      });

      await this.sendEvent(steamId.toString(), event);
    }
  }

  async gameEnd(gameEnd: GameEndDto) {
    for (const player of gameEnd.players) {
      if (player.steamId === 0) {
        // 暂且不统计电脑数据
        logger.debug('skip computer player', player);
        continue;
      }
      logger.debug('send game_end event for player', player);
      const event = await this.buildPlayerEvent(
        'player_game_end',
        player.steamId,
        gameEnd.matchId.toString(),
        {
          method: 'steam',
          steam_id: player.steamId,
          matchId: gameEnd.matchId,
          engagement_time_msec: gameEnd.gameTimeMsec,
          difficulty: gameEnd.gameOption.gameDifficulty,
          version: gameEnd.version,
          is_winner: gameEnd.winnerTeamId === player.teamId,
          team_id: player.teamId,
          hero_name: player.heroName,
          points: player.points,
          is_disconnect: player.isDisconnect,
        },
      );

      await this.sendEvent(player.steamId.toString(), event);
    }
  }

  async lotteryPickAbility(pickDto: PickDto) {
    const event = await this.buildPlayerEvent(
      'lottery_pick_ability',
      pickDto.steamId,
      pickDto.matchId,
      {
        method: 'steam',
        steam_id: pickDto.steamId,
        match_id: pickDto.matchId,
        ability_name: pickDto.name,
        level: pickDto.level,
        difficulty: pickDto.difficulty,
        version: pickDto.version,
      },
    );

    await this.sendEvent(pickDto.steamId.toString(), event);
  }

  async lotteryPickItem(pickDto: PickDto) {
    const event = await this.buildPlayerEvent(
      'lottery_pick_item',
      pickDto.steamId,
      pickDto.matchId,
      {
        method: 'steam',
        steam_id: pickDto.steamId,
        match_id: pickDto.matchId,
        item_name: pickDto.name,
        level: pickDto.level,
        difficulty: pickDto.difficulty,
        version: pickDto.version,
      },
    );

    await this.sendEvent(pickDto.steamId.toString(), event);
  }

  async buildPlayerEvent(
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
        session_number: matchId,
        engagement_time_msec: (eventParams.engagement_time_msec as number | string) || 1000,
        debug_mode: process.env.ENVIRONMENT === 'local',
      },
    };

    return event;
  }

  async sendEvent(userId: string, event: Event, userProperties?: UserProperties) {
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
