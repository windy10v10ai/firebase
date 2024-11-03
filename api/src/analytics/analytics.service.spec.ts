import { Test, TestingModule } from '@nestjs/testing';
import fetch from 'node-fetch';

import { GameEndDto } from '../game/dto/game-end.request.body';
import { SecretService } from '../util/secret/secret.service';

import { AnalyticsService } from './analytics.service';

jest.mock('node-fetch');
const { Response } = jest.requireActual('node-fetch');

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: SecretService,
          useValue: {
            getSecretValue: jest.fn().mockReturnValue('GA_MEASUREMENT_ID'),
          },
        },
        {
          provide: 'AnalyticsRepository',
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('gameStart', () => {
    it('should send events for each steamId', async () => {
      const steamIds = [123, 456];
      const matchId = 789;
      jest.spyOn(service, 'sendEvent').mockResolvedValue(true);
      await service.gameStart(steamIds, matchId);

      expect(service.sendEvent).toHaveBeenCalledTimes(steamIds.length);
    });
  });

  describe('gameEnd', () => {
    it('should send events for each player except those with steamId 0', async () => {
      const gameEnd: GameEndDto = {
        matchId: 789,
        gameTimeMsec: 10000,
        gameOption: {
          gameDifficulty: 6,
          playerGoldXpMultiplier: 1,
          botGoldXpMultiplier: 1,
          towerPower: 1,
          towerEndure: 1,
        },
        version: '1.0',
        winnerTeamId: 2,
        players: [
          {
            steamId: 123,
            teamId: 1,
            heroName: 'hero1',
            points: 10,
            isDisconnect: false,
          },
          {
            steamId: 0,
            teamId: 2,
            heroName: 'hero2',
            points: 20,
            isDisconnect: true,
          },
        ],
      };
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(
        new Response(null, { status: 204 }),
      );
      jest.spyOn(service, 'sendEvent').mockResolvedValue(true);

      await service.gameEnd(gameEnd);

      expect(service.sendEvent).toHaveBeenCalledTimes(1);
    });
  });
});
