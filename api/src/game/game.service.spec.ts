import { Test } from '@nestjs/testing';

import { AnalyticsService } from '../analytics/analytics.service';
import { EventRewardsService } from '../event-rewards/event-rewards.service';
import { MembersService } from '../members/members.service';
import { PlayerSettingService } from '../player/player-setting.service';
import { PlayerService } from '../player/player.service';
import { PlayerPropertyService } from '../player-property/player-property.service';

import { GameService } from './game.service';

describe('GameService', () => {
  let service: GameService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        GameService,
        {
          provide: PlayerService,
          useValue: {
            createNewPlayer: jest.fn(),
            upsertMemberPoint: jest.fn(),
            updateLastMatchTime: jest.fn(),
            upsertAddPoint: jest.fn(),
          },
        },
        {
          provide: MembersService,
          useValue: {},
        },
        {
          provide: EventRewardsService,
          useValue: {},
        },
        {
          provide: PlayerPropertyService,
          useValue: {},
        },
        {
          provide: AnalyticsService,
          useValue: {},
        },
        {
          provide: PlayerSettingService,
          useValue: {},
        },
      ],
    }).compile();

    service = moduleRef.get<GameService>(GameService);
  });
  describe('getOK', () => {
    it('should return OK', () => {
      expect(service.getOK()).toBe('OK');
    });
  });
});
