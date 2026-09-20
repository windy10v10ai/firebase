import { Test } from '@nestjs/testing';
import { BaseFirestoreRepository } from 'fireorm';

import { AnalyticsService } from '../analytics/analytics.service';
import { DailyTaskService } from '../daily-task/services/daily-task.service';
import { EventRewardsService } from '../event-rewards/event-rewards.service';
import { Member, MemberLevel } from '../members/entities/members.entity';
import { MembersService } from '../members/members.service';
import { PlayerSettingService } from '../player/player-setting.service';
import { PlayerStatsLifetimeService } from '../player/player-stats-lifetime.service';
import { PlayerService } from '../player/player.service';
import { PlayerInfoService } from '../player-info/player-info.service';
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
          provide: DailyTaskService,
          useValue: { recordGameEnd: jest.fn() },
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
          provide: PlayerStatsLifetimeService,
          useValue: { accumulate: jest.fn() },
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
        {
          provide: PlayerInfoService,
          useValue: { findPlayerInfoBySteamIds: jest.fn() },
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

    it('should return GA4 config for ANIME server', () => {
      const result = service.getGA4Config(SERVER_TYPE.ANIME);

      expect(result).toEqual({
        measurementId: mockMeasurementId,
        apiSecret: mockApiSecret,
        serverType: SERVER_TYPE.ANIME,
      });
      expect(secretService.getSecretValue).toHaveBeenCalledWith(SECRET.GA4_API_SECRET);
    });

    it('should return GA4 config for LOCAL server', () => {
      const result = service.getGA4Config(SERVER_TYPE.LOCAL);

      expect(result).toEqual({
        measurementId: mockMeasurementId,
        apiSecret: mockApiSecret,
        serverType: SERVER_TYPE.LOCAL,
      });
      expect(secretService.getSecretValue).toHaveBeenCalledWith(SECRET.GA4_API_SECRET);
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

    it('windy主机 活动期间内 未领取 应发放故障补偿积分', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-13T00:00:00.000Z'));
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
            cn: '服务器故障补偿',
            en: 'Server Outage Compensation',
          },
          seasonPoint: 5000,
        },
      ]);
    });

    it('test主机 活动期间内 未领取 应发放故障补偿积分', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-13T00:00:00.000Z'));
      eventRewardsService.getRewardResults.mockResolvedValue([{ steamId, result: undefined }]);

      const result = await service.giveEventReward([steamId], SERVER_TYPE.TEST);

      expect(playerService.upsertAddPoint).toHaveBeenCalledWith(steamId, {
        seasonPointTotal: 5000,
      });
      expect(result).toEqual([
        {
          steamId,
          title: {
            cn: '服务器故障补偿',
            en: 'Server Outage Compensation',
          },
          seasonPoint: 5000,
        },
      ]);
    });

    it('未知来源主机 活动期间内 不应发放', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-13T00:00:00.000Z'));

      const result = await service.giveEventReward([steamId], SERVER_TYPE.UNKNOWN);

      expect(eventRewardsService.getRewardResults).not.toHaveBeenCalled();
      expect(playerService.upsertAddPoint).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('windy主机 活动期间外 不应发放', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-20T00:00:00.000Z'));
      eventRewardsService.getRewardResults.mockResolvedValue([{ steamId, result: undefined }]);

      const result = await service.giveEventReward([steamId], SERVER_TYPE.WINDY);

      expect(playerService.upsertAddPoint).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('windy主机 活动期间内 已领取 不应重复发放', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-13T00:00:00.000Z'));
      eventRewardsService.getRewardResults.mockResolvedValue([
        { steamId, result: { id: steamId.toString(), steamId, compensation20260912: true } },
      ]);

      const result = await service.giveEventReward([steamId], SERVER_TYPE.WINDY);

      expect(playerService.upsertAddPoint).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });
});

describe('GameService.addDailyMemberPoints', () => {
  function createContext(member: Member) {
    let store = member;
    const repository = {
      findById: jest.fn(async () => store),
      update: jest.fn(async (next: Member) => {
        store = next;
        return next;
      }),
    } as unknown as BaseFirestoreRepository<Member>;
    const playerService = { upsertAddPoint: jest.fn(async () => undefined) };
    const membersService = new MembersService(repository, playerService as never);
    const gameService = new GameService(
      playerService as never,
      null,
      null,
      null,
      membersService,
      null,
      null,
      null,
    );
    return { gameService, playerService, read: () => store };
  }

  const member: Member = {
    id: '1',
    steamId: 1,
    expireDate: new Date('2099-01-01T00:00:00Z'),
    level: MemberLevel.NORMAL,
    periodStartDate: new Date('2026-07-01T00:00:00Z'),
    lastDailyDate: new Date('2026-08-06T00:00:00Z'),
  };

  afterEach(() => {
    jest.useRealTimers();
  });

  it('漏签 3 天：一次加满 400，当日与补签各回一条游戏内提示', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-10T00:00:00Z'));
    const { gameService, playerService, read } = createContext({ ...member });

    const pointInfo = await gameService.addDailyMemberPoints([read()]);

    expect(playerService.upsertAddPoint).toHaveBeenCalledWith(1, { memberPointTotal: 400 });
    expect(read().lastDailyDate).toEqual(new Date('2026-08-10T00:00:00Z'));
    expect(pointInfo).toEqual([
      expect.objectContaining({ steamId: 1, memberPoint: 100 }),
      expect.objectContaining({ steamId: 1, memberPoint: 300 }),
    ]);
  });

  it('当日已签到：不加分，也不回提示', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-10T00:00:00Z'));
    const { gameService, playerService, read } = createContext({
      ...member,
      lastDailyDate: new Date('2026-08-10T00:00:00Z'),
    });

    const pointInfo = await gameService.addDailyMemberPoints([read()]);

    expect(playerService.upsertAddPoint).not.toHaveBeenCalled();
    expect(pointInfo).toEqual([]);
  });
});
