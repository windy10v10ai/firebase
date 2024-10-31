import { Injectable } from '@nestjs/common';
import { logger } from 'firebase-functions/v1';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { GameEndDto } from '../game/dto/game-end.request.body';
import { SECRET, SecretService } from '../util/secret/secret.service';

import { Analytics } from './entities/analytics.entity';

interface Event {
  name: string;
  params: {
    [key: string]: number | string | boolean;
    session_id: number | string;
    // session_number: number | string;
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
  private readonly measurementProtocolUrl =
    'https://www.google-analytics.com/mp/collect';
  private readonly measurementId = process.env.GA_MEASUREMENT_ID;

  constructor(
    private readonly secretService: SecretService,
    @InjectRepository(Analytics)
    private readonly analyticsRepository: BaseFirestoreRepository<Analytics>,
  ) {}

  async gameStart(steamIds: number[], matchId: number) {
    for (const steamId of steamIds) {
      const event = await this.buildEvent(
        'game_start',
        steamId,
        matchId,
        {
          method: 'steam',
          steam_id: steamId,
          match_id: matchId,
        },
        true,
      );

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
      const event = await this.buildEvent(
        'game_end',
        player.steamId,
        gameEnd.matchId,
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

  async buildEvent(
    eventName: string,
    steamId: number,
    matchId: number,
    eventParams: { [key: string]: number | string | boolean },
    isNewSession: boolean = false,
  ) {
    const sessionNumber = isNewSession
      ? await this.updateSessionNumber(steamId)
      : await this.getSessionNumber(steamId);
    const event: Event = {
      name: eventName,
      params: {
        ...eventParams,
        session_id: `${steamId}-${matchId}`,
        // session_number: sessionNumber,
        engagement_time_msec:
          (eventParams.engagement_time_msec as number | string) || 1000,
        debug_mode: process.env.ENVIRONMENT === 'local',
      },
    };

    return event;
  }

  async getSessionNumber(steamId: number): Promise<number> {
    const analytics = await this.analyticsRepository.findById(
      steamId.toString(),
    );
    if (!analytics) {
      return this.updateSessionNumber(steamId);
    }
    return analytics.sessionNumber;
  }

  async updateSessionNumber(steamId: number): Promise<number> {
    const analytics = await this.analyticsRepository.findById(
      steamId.toString(),
    );
    if (!analytics) {
      const newAnalytics = new Analytics();
      newAnalytics.id = steamId.toString();
      newAnalytics.sessionNumber = 1;
      await this.analyticsRepository.create(newAnalytics);
      return 1;
    } else {
      analytics.sessionNumber++;
      await this.analyticsRepository.update(analytics);
      return analytics.sessionNumber;
    }
  }

  async sendEvent(
    userId: string,
    event: Event,
    userProperties?: UserProperties,
  ) {
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
