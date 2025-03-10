import { Test } from '@nestjs/testing';
import { getRepositoryToken } from 'nestjs-fireorm';

import { AnalyticsService } from '../analytics/analytics.service';
import { PlayerCountService } from '../player-count/player-count.service';

import { Player } from './entities/player.entity';
import { PlayerService } from './player.service';

describe('CatsController', () => {
  let playerService: PlayerService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PlayerService,
        {
          provide: getRepositoryToken(Player),
          useValue: {},
        },
        {
          provide: AnalyticsService,
          useValue: {},
        },
        {
          provide: PlayerCountService,
          useValue: {},
        },
      ],
    }).compile();

    playerService = moduleRef.get<PlayerService>(PlayerService);
  });
  describe('赛季积分', () => {
    describe('升级所需积分', () => {
      let level = 1;
      let point = 100;
      it(`${level} -> ${point}`, async () => {
        const level = 1;
        const point = 100;
        const result = playerService.getSeasonNextLevelPoint(level);
        expect(result).toBe(point);
      });

      level = 2;
      point = 200;
      it(`${level} -> ${point}`, async () => {
        const level = 2;
        const point = 200;
        const result = playerService.getSeasonNextLevelPoint(level);
        expect(result).toBe(point);
      });

      level = 20;
      point = 2000;
      it(`${level} -> ${point}`, async () => {
        const level = 20;
        const point = 2000;
        const result = playerService.getSeasonNextLevelPoint(level);
        expect(result).toBe(point);
      });
      level = 50;
      point = 5000;
      it(`${level} -> ${point}`, async () => {
        const level = 50;
        const point = 5000;
        const result = playerService.getSeasonNextLevelPoint(level);
        expect(result).toBe(point);
      });
    });
    describe('等级所需累计积分', () => {
      let level = 1;
      let point = 0;
      it(`${level} -> ${point}`, async () => {
        const level = 1;
        const point = 0;
        const result = playerService.getSeasonTotalPoint(level);
        expect(result).toBe(point);
      });

      level = 2;
      point = 100;
      it(`${level} -> ${point}`, async () => {
        const level = 2;
        const point = 100;
        const result = playerService.getSeasonTotalPoint(level);
        expect(result).toBe(point);
      });

      level = 3;
      point = 300;
      it(`${level} -> ${point}`, async () => {
        const level = 3;
        const point = 300;
        const result = playerService.getSeasonTotalPoint(level);
        expect(result).toBe(point);
      });

      level = 20;
      point = 19000;
      it(`${level} -> ${point}`, async () => {
        const level = 20;
        const point = 19000;
        const result = playerService.getSeasonTotalPoint(level);
        expect(result).toBe(point);
      });
      level = 50;
      point = 122500;
      it(`${level} -> ${point}`, async () => {
        const level = 50;
        const point = 122500;
        const result = playerService.getSeasonTotalPoint(level);
        expect(result).toBe(point);
      });
    });

    describe('根据积分获取当前等级', () => {
      let point = 0;
      let level = 1;
      it(`${point} -> ${level}`, async () => {
        const point = 0;
        const level = 1;
        const result = playerService.getSeasonLevelBuyPoint(point);
        expect(result).toBe(level);
      });

      point = 99;
      level = 1;
      it(`${point} -> ${level}`, async () => {
        const point = 99;
        const level = 1;
        const result = playerService.getSeasonLevelBuyPoint(point);
        expect(result).toBe(level);
      });
      point = 100;
      level = 2;
      it(`${point} -> ${level}`, async () => {
        const point = 100;
        const level = 2;
        const result = playerService.getSeasonLevelBuyPoint(point);
        expect(result).toBe(level);
      });
      point = 299;
      level = 2;
      it(`${point} -> ${level}`, async () => {
        const point = 299;
        const level = 2;
        const result = playerService.getSeasonLevelBuyPoint(point);
        expect(result).toBe(level);
      });
      point = 300;
      level = 3;
      it(`${point} -> ${level}`, async () => {
        const point = 300;
        const level = 3;
        const result = playerService.getSeasonLevelBuyPoint(point);
        expect(result).toBe(level);
      });
      point = 18999;
      level = 19;
      it(`${point} -> ${level}`, async () => {
        const point = 18999;
        const level = 19;
        const result = playerService.getSeasonLevelBuyPoint(point);
        expect(result).toBe(level);
      });
      point = 19000;
      level = 20;
      it(`${point} -> ${level}`, async () => {
        const point = 19000;
        const level = 20;
        const result = playerService.getSeasonLevelBuyPoint(point);
        expect(result).toBe(level);
      });
      point = 122499;
      level = 49;
      it(`${point} -> ${level}`, async () => {
        const point = 122499;
        const level = 49;
        const result = playerService.getSeasonLevelBuyPoint(point);
        expect(result).toBe(level);
      });
      point = 122500;
      level = 50;
      it(`${point} -> ${level}`, async () => {
        const point = 122500;
        const level = 50;
        const result = playerService.getSeasonLevelBuyPoint(point);
        expect(result).toBe(level);
      });
    });
  });

  describe('会员积分', () => {
    describe('升级所需积分', () => {
      let level = 0;
      let point = 0;
      it(`${level} -> ${point}`, async () => {
        const result = playerService.getMemberNextLevelPoint(level);
        expect(result).toBe(point);
      });

      level = 1;
      point = 1000;
      it(`${level} -> ${point}`, async () => {
        const result = playerService.getMemberNextLevelPoint(level);
        expect(result).toBe(point);
      });

      level = 2;
      point = 1050;
      it(`${level} -> ${point}`, async () => {
        const result = playerService.getMemberNextLevelPoint(level);
        expect(result).toBe(point);
      });
      level = 20;
      point = 1950;
      it(`${level} -> ${point}`, async () => {
        const result = playerService.getMemberNextLevelPoint(level);
        expect(result).toBe(point);
      });
      level = 50;
      point = 3450;
      it(`${level} -> ${point}`, async () => {
        const result = playerService.getMemberNextLevelPoint(level);
        expect(result).toBe(point);
      });
    });

    describe('等级所需累计积分', () => {
      let level = 1;
      let point = 0;
      it(`${level} -> ${point}`, async () => {
        const result = playerService.getMemberTotalPoint(level);
        expect(result).toBe(point);
      });

      level = 2;
      point = 1000;
      it(`${level} -> ${point}`, async () => {
        const result = playerService.getMemberTotalPoint(level);
        expect(result).toBe(point);
      });

      level = 3;
      point = 2050;
      it(`${level} -> ${point}`, async () => {
        const result = playerService.getMemberTotalPoint(level);
        expect(result).toBe(point);
      });
      level = 21;
      point = 29500;
      it(`${level} -> ${point}`, async () => {
        const result = playerService.getMemberTotalPoint(level);
        expect(result).toBe(point);
      });
      level = 51;
      point = 111250;
      it(`${level} -> ${point}`, async () => {
        const result = playerService.getMemberTotalPoint(level);
        expect(result).toBe(point);
      });
    });

    describe('根据积分获取当前等级', () => {
      let point = 0;
      let level = 1;
      it(`${point} -> ${level}`, async () => {
        const result = playerService.getMemberLevelBuyPoint(point);
        expect(result).toBe(level);
      });

      point = 999;
      level = 1;
      it(`${point} -> ${level}`, async () => {
        const result = playerService.getMemberLevelBuyPoint(point);
        expect(result).toBe(level);
      });
      point = 1000;
      level = 2;
      it(`${point} -> ${level}`, async () => {
        const result = playerService.getMemberLevelBuyPoint(point);
        expect(result).toBe(level);
      });
      point = 1001;
      level = 2;
      it(`${point} -> ${level}`, async () => {
        const result = playerService.getMemberLevelBuyPoint(point);
        expect(result).toBe(level);
      });
      point = 2049;
      level = 2;
      it(`${point} -> ${level}`, async () => {
        const result = playerService.getMemberLevelBuyPoint(point);
        expect(result).toBe(level);
      });
      point = 2050;
      level = 3;
      it(`${point} -> ${level}`, async () => {
        const result = playerService.getMemberLevelBuyPoint(point);
        expect(result).toBe(level);
      });
      point = 29500;
      level = 21;
      it(`${point} -> ${level}`, async () => {
        const result = playerService.getMemberLevelBuyPoint(point);
        expect(result).toBe(level);
      });
      point = 111250;
      level = 51;
      it(`${point} -> ${level}`, async () => {
        const result = playerService.getMemberLevelBuyPoint(point);
        expect(result).toBe(level);
      });
    });
  });
});
