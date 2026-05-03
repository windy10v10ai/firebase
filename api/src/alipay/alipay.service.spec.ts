import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from 'nestjs-fireorm';

import { AlipayApiService } from './alipay.api.service';
import { ALIPAY_PRODUCT_TABLE, ALIPAY_QR_EXPIRE_MS } from './alipay.constants';
import { AlipayService } from './alipay.service';
import { CreateAlipayOrderDto } from './dto/create-alipay-order.dto';
import { AlipayOrder } from './entities/alipay-order.entity';
import { AlipayProductCode } from './enums/alipay-product-code.enum';
import { AlipayTradeStatus } from './enums/alipay-trade-status.enum';

describe('AlipayService', () => {
  let service: AlipayService;
  let apiService: jest.Mocked<AlipayApiService>;
  let repo: { create: jest.Mock; update: jest.Mock };

  beforeEach(async () => {
    repo = {
      create: jest.fn().mockImplementation((entity) => Promise.resolve({ ...entity })),
      update: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AlipayService,
        {
          provide: AlipayApiService,
          useValue: { precreate: jest.fn().mockResolvedValue('https://qr.alipay.com/mock') },
        },
        {
          provide: getRepositoryToken(AlipayOrder),
          useValue: repo,
        },
      ],
    }).compile();

    service = moduleRef.get<AlipayService>(AlipayService);
    apiService = moduleRef.get(AlipayApiService);
  });

  describe('calculatePrice', () => {
    it('单份会员 ¥28.00（2800 分）', () => {
      const r = service.calculatePrice(AlipayProductCode.MEMBER_PREMIUM, 1);
      expect(r.totalAmountCent).toBe(2800);
      expect(r.totalAmount).toBe('28.00');
    });

    it('3 份会员 ¥84.00（线性倍乘，无折扣）', () => {
      const r = service.calculatePrice(AlipayProductCode.MEMBER_PREMIUM, 3);
      expect(r.totalAmountCent).toBe(8400);
      expect(r.totalAmount).toBe('84.00');
    });

    it.each([
      [AlipayProductCode.POINTS_TIER1, 7800, '78.00'],
      [AlipayProductCode.POINTS_TIER2, 23800, '238.00'],
      [AlipayProductCode.POINTS_TIER3, 56800, '568.00'],
    ])('单份积分档位 %s 价格正确', (code, cent, yuan) => {
      const r = service.calculatePrice(code, 1);
      expect(r.totalAmountCent).toBe(cent);
      expect(r.totalAmount).toBe(yuan);
    });

    it('totalAmount 始终保留两位小数（满整元也带 .00）', () => {
      expect(service.calculatePrice(AlipayProductCode.MEMBER_PREMIUM, 1).totalAmount).toBe('28.00');
    });

    it.each([0, -1, 1.5, NaN])('quantity 非法值 %s 抛 BadRequestException', (q) => {
      expect(() => service.calculatePrice(AlipayProductCode.MEMBER_PREMIUM, q)).toThrow(
        BadRequestException,
      );
    });

    it('未知 productCode 抛 BadRequestException', () => {
      expect(() => service.calculatePrice('NOPE' as AlipayProductCode, 1)).toThrow(
        BadRequestException,
      );
    });
  });

  describe('createOrder', () => {
    const baseDto: CreateAlipayOrderDto = {
      steamId: 123456789,
      productCode: AlipayProductCode.MEMBER_PREMIUM,
      quantity: 1,
    };

    it('单份会员：金额 ¥28.00、subject 用 subjectUnit', async () => {
      const res = await service.createOrder(baseDto);

      expect(res.totalAmount).toBe('28.00');
      expect(res.subject).toBe(ALIPAY_PRODUCT_TABLE[AlipayProductCode.MEMBER_PREMIUM].subjectUnit);
      expect(res.qrCode).toBe('https://qr.alipay.com/mock');
      expect(res.outTradeNo).toMatch(/^ali-123456789-\d+-[a-z0-9]{4}$/);
      expect(new Date(res.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('多份会员：金额按 quantity 倍增、subject 追加月数', async () => {
      const res = await service.createOrder({ ...baseDto, quantity: 3 });

      expect(res.totalAmount).toBe('84.00');
      expect(res.subject).toBe(`${ALIPAY_PRODUCT_TABLE.MEMBER_PREMIUM.subjectUnit} 3个月`);
    });

    it('多份积分：subject 追加 N 份（区别于会员的"个月"）', async () => {
      const res = await service.createOrder({
        steamId: 1,
        productCode: AlipayProductCode.POINTS_TIER1,
        quantity: 2,
      });

      expect(res.totalAmount).toBe('156.00'); // 7800 * 2 / 100
      expect(res.subject).toBe(`${ALIPAY_PRODUCT_TABLE.POINTS_TIER1.subjectUnit} 2份`);
    });

    it('quantity 缺省时按 1 处理', async () => {
      const { quantity: _q, ...dtoWithoutQuantity } = baseDto;
      const res = await service.createOrder(dtoWithoutQuantity as CreateAlipayOrderDto);

      expect(res.totalAmount).toBe('28.00');
      expect(res.subject).toBe(ALIPAY_PRODUCT_TABLE.MEMBER_PREMIUM.subjectUnit);
    });

    it('未知 productCode 抛 BadRequestException', async () => {
      await expect(
        service.createOrder({
          ...baseDto,
          productCode: 'NOT_A_REAL_CODE' as AlipayProductCode,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(apiService.precreate).not.toHaveBeenCalled();
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('先 create WAITING（qrCode 空）→ 调 precreate → update 写回 qrCode', async () => {
      const callOrder: string[] = [];
      repo.create.mockImplementationOnce(async (entity) => {
        callOrder.push('create');
        expect(entity.qrCode).toBe('');
        expect(entity.status).toBe(AlipayTradeStatus.WAITING);
        return { ...entity };
      });
      apiService.precreate.mockImplementationOnce(async () => {
        callOrder.push('precreate');
        return 'https://qr.alipay.com/scan-me';
      });
      repo.update.mockImplementationOnce(async (entity) => {
        callOrder.push('update');
        expect(entity.qrCode).toBe('https://qr.alipay.com/scan-me');
        return entity;
      });

      await service.createOrder(baseDto);

      expect(callOrder).toEqual(['create', 'precreate', 'update']);
    });

    it('outTradeNo 在并发场景仍然唯一（10 次同 steamId 无重复）', async () => {
      const ids = await Promise.all(
        Array.from({ length: 10 }, () => service.createOrder(baseDto).then((r) => r.outTradeNo)),
      );
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('落库实体包含价格分单位与 quantity', async () => {
      await service.createOrder({ ...baseDto, quantity: 2 });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          steamId: baseDto.steamId,
          productCode: baseDto.productCode,
          quantity: 2,
          totalAmountCent: 5600,
          status: AlipayTradeStatus.WAITING,
        }),
      );
    });

    it('qrCodeExpiresAt = now + 2h', async () => {
      const before = Date.now();
      const res = await service.createOrder(baseDto);
      const after = Date.now();
      const expiresMs = new Date(res.expiresAt).getTime();

      expect(expiresMs).toBeGreaterThanOrEqual(before + ALIPAY_QR_EXPIRE_MS);
      expect(expiresMs).toBeLessThanOrEqual(after + ALIPAY_QR_EXPIRE_MS);
    });
  });
});
