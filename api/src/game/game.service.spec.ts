import { Test } from '@nestjs/testing';

import { AnalyticsService } from '../analytics/analytics.service';
import { EventRewardsService } from '../event-rewards/event-rewards.service';
import { MembersService } from '../members/members.service';
import { PlayerSettingService } from '../player/player-setting.service';
import { PlayerService } from '../player/player.service';
import { PlayerPropertyService } from '../player-property/player-property.service';
import { SECRET, SERVER_TYPE, SecretService } from '../util/secret/secret.service';

import { GameService } from './game.service';

describe('GameService', () => {
  let service: GameService;
  let secretService: jest.Mocked<SecretService>;

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
        {
          provide: SecretService,
          useValue: {
            getSecretValue: jest.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get<GameService>(GameService);
    secretService = moduleRef.get(SecretService);
  });
  describe('getOK', () => {
    it('should return OK', () => {
      expect(service.getOK()).toBe('OK');
    });
  });

  describe('getGA4Config', () => {
    const mockMeasurementId = 'G-XXXXXXXXXX';
    const mockApiSecret = 'test-api-secret';

    beforeEach(() => {
      // 设置环境变量
      process.env.GA_MEASUREMENT_ID = mockMeasurementId;
      // Mock SecretService
      secretService.getSecretValue.mockReturnValue(mockApiSecret);
    });

    afterEach(() => {
      // 清理环境变量
      delete process.env.GA_MEASUREMENT_ID;
      jest.clearAllMocks();
    });

    it('should return GA4 config for WINDY server', () => {
      const result = service.getGA4Config(SERVER_TYPE.WINDY);

      expect(result).toEqual({
        measurementId: mockMeasurementId,
        apiSecret: mockApiSecret,
        serverType: SERVER_TYPE.WINDY,
      });
      expect(secretService.getSecretValue).toHaveBeenCalledWith(SECRET.GA4_API_SECRET);
    });

    it('should return GA4 config for TEST server', () => {
      const result = service.getGA4Config(SERVER_TYPE.TEST);

      expect(result).toEqual({
        measurementId: mockMeasurementId,
        apiSecret: mockApiSecret,
        serverType: SERVER_TYPE.TEST,
      });
      expect(secretService.getSecretValue).toHaveBeenCalledWith(SECRET.GA4_API_SECRET);
    });

    it('should return GA4 config for TENVTEN server', () => {
      const result = service.getGA4Config(SERVER_TYPE.TENVTEN);

      expect(result).toEqual({
        measurementId: mockMeasurementId,
        apiSecret: mockApiSecret,
        serverType: SERVER_TYPE.TENVTEN,
      });
      expect(secretService.getSecretValue).toHaveBeenCalledWith(SECRET.GA4_API_SECRET);
    });

    it('should return undefined for LOCAL server', () => {
      const result = service.getGA4Config(SERVER_TYPE.LOCAL);

      expect(result).toBeUndefined();
      expect(secretService.getSecretValue).not.toHaveBeenCalled();
    });

    it('should return undefined for UNKNOWN server', () => {
      const result = service.getGA4Config(SERVER_TYPE.UNKNOWN);

      expect(result).toBeUndefined();
      expect(secretService.getSecretValue).not.toHaveBeenCalled();
    });

    it('should return undefined when measurementId is not set', () => {
      delete process.env.GA_MEASUREMENT_ID;

      const result = service.getGA4Config(SERVER_TYPE.WINDY);

      expect(result).toBeUndefined();
      expect(secretService.getSecretValue).toHaveBeenCalledWith(SECRET.GA4_API_SECRET);
    });

    it('should return undefined when apiSecret is not available', () => {
      secretService.getSecretValue.mockImplementation(() => {
        throw new Error('Secret not found');
      });

      expect(() => service.getGA4Config(SERVER_TYPE.WINDY)).toThrow('Secret not found');
    });
  });
});
