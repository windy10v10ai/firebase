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
  let playerService: jest.Mocked<PlayerService>;
  let eventRewardsService: jest.Mocked<EventRewardsService>;

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
          useValue: {
            getRewardResults: jest.fn(),
            setReward: jest.fn(),
          },
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
    playerService = moduleRef.get(PlayerService);
    eventRewardsService = moduleRef.get(EventRewardsService);
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

    it('should return undefined for TENVTEN server', () => {
      const result = service.getGA4Config(SERVER_TYPE.TENVTEN);

      expect(result).toBeUndefined();
      expect(secretService.getSecretValue).not.toHaveBeenCalled();
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

  describe('giveEventReward', () => {
    const steamId = 100000001;

    afterEach(() => {
      jest.useRealTimers();
      jest.clearAllMocks();
    });

    it('windy主机 活动期间内 未领取 应发放端午节积分', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-19T00:00:00.000Z'));
      eventRewardsService.getRewardResults.mockResolvedValue([{ steamId, result: undefined }]);

      const result = await service.giveEventReward([steamId], SERVER_TYPE.WINDY);

      expect(playerService.upsertAddPoint).toHaveBeenCalledWith(steamId, {
        seasonPointTotal: 5000,
      });
      expect(eventRewardsService.setReward).toHaveBeenCalledWith(steamId);
      expect(result).toEqual([
        {
          steamId,
          title: {
            cn: '端午节快乐！',
            en: 'Dragon Boat Festival Bonus!',
          },
          seasonPoint: 5000,
        },
      ]);
    });

    it('非windy主机 活动期间内 不应发放', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-19T00:00:00.000Z'));

      const result = await service.giveEventReward([steamId], SERVER_TYPE.TEST);

      expect(eventRewardsService.getRewardResults).not.toHaveBeenCalled();
      expect(playerService.upsertAddPoint).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('windy主机 活动期间外 不应发放', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-23T00:00:00.000Z'));
      eventRewardsService.getRewardResults.mockResolvedValue([{ steamId, result: undefined }]);

      const result = await service.giveEventReward([steamId], SERVER_TYPE.WINDY);

      expect(playerService.upsertAddPoint).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('windy主机 活动期间内 已领取 不应重复发放', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-19T00:00:00.000Z'));
      eventRewardsService.getRewardResults.mockResolvedValue([
        { steamId, result: { id: steamId.toString(), steamId, dragonBoat2026: true } },
      ]);

      const result = await service.giveEventReward([steamId], SERVER_TYPE.WINDY);

      expect(playerService.upsertAddPoint).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });
});
