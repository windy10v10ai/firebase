import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from 'nestjs-fireorm';

import { AnalyticsPurchaseService } from '../analytics/analytics.purchase.service';
import { MemberLevel } from '../members/entities/members.entity';
import { MembersService } from '../members/members.service';
import { PlayerService } from '../player/player.service';

import { StripeOrder } from './entities/stripe-order.entity';
import { StripeOrderStatus } from './enums/stripe-order-status.enum';
import { StripeProductCode } from './enums/stripe-product-code.enum';
import { StripeApiService } from './stripe.api.service';
import { StripeService } from './stripe.service';

const STEAM_ID = 136407523;
const ORDER_ID = `stripe-${STEAM_ID}-1-abcd`;
const RAW_BODY = Buffer.from('{}');

function buildOrder(overrides: Partial<StripeOrder> = {}): StripeOrder {
  return {
    id: ORDER_ID,
    steamId: STEAM_ID,
    productCode: StripeProductCode.MEMBER_PREMIUM,
    quantity: 1,
    amountCent: 400,
    currency: 'usd',
    status: StripeOrderStatus.WAITING,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function completedEvent(sessionOverrides: Record<string, unknown> = {}) {
  return {
    type: 'checkout.session.completed',
    created: 1_800_000_000,
    data: {
      object: {
        id: 'cs_test_1',
        client_reference_id: ORDER_ID,
        payment_status: 'paid',
        amount_total: 400,
        currency: 'usd',
        payment_intent: 'pi_test_1',
        ...sessionOverrides,
      },
    },
  };
}

describe('StripeService', () => {
  let service: StripeService;
  let apiService: { createCheckoutSession: jest.Mock; constructEvent: jest.Mock };
  let repo: { create: jest.Mock; update: jest.Mock; findById: jest.Mock };
  let membersService: { createMember: jest.Mock };
  let analytics: { stripePurchase: jest.Mock };
  let playerService: { upsertAddPoint: jest.Mock };

  beforeEach(async () => {
    process.env.WEB_ORIGIN = 'https://example.com';
    apiService = {
      createCheckoutSession: jest
        .fn()
        .mockResolvedValue({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' }),
      constructEvent: jest.fn(),
    };
    repo = {
      create: jest.fn().mockImplementation((entity) => Promise.resolve({ ...entity })),
      update: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      findById: jest.fn(),
    };
    membersService = { createMember: jest.fn().mockResolvedValue({}) };
    analytics = { stripePurchase: jest.fn().mockResolvedValue(undefined) };
    playerService = { upsertAddPoint: jest.fn().mockResolvedValue({}) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        StripeService,
        { provide: StripeApiService, useValue: apiService },
        { provide: getRepositoryToken(StripeOrder), useValue: repo },
        { provide: MembersService, useValue: membersService },
        { provide: PlayerService, useValue: playerService },
        { provide: AnalyticsPurchaseService, useValue: analytics },
      ],
    }).compile();
    service = moduleRef.get(StripeService);
  });

  describe('createOrder', () => {
    it('没有网站登录身份时拒绝下单', async () => {
      await expect(service.createOrder(undefined)).rejects.toThrow(UnauthorizedException);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('订单归属登录玩家，价格取后端常量，先落库再建收银台', async () => {
      const result = await service.createOrder(String(STEAM_ID));

      const created = repo.create.mock.calls[0][0];
      expect(created).toMatchObject({
        steamId: STEAM_ID,
        productCode: StripeProductCode.MEMBER_PREMIUM,
        quantity: 1,
        amountCent: 400,
        currency: 'usd',
        status: StripeOrderStatus.WAITING,
      });
      expect(repo.create.mock.invocationCallOrder[0]).toBeLessThan(
        apiService.createCheckoutSession.mock.invocationCallOrder[0],
      );
      expect(apiService.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: created.id,
          amountCent: 400,
          currency: 'usd',
          successUrl: `https://example.com/membership?stripeOrderId=${created.id}`,
          locale: 'en',
          productImageUrl: 'https://example.com/images/member/stripe-premium.png',
        }),
      );
      expect(repo.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: created.id, checkoutSessionId: 'cs_test_1' }),
      );
      expect(result).toEqual({
        orderId: created.id,
        checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_1',
      });
    });

    it('收银台语言与商品文案跟随网站语言，并写明开通的 ID', async () => {
      await service.createOrder(String(STEAM_ID), { locale: 'zh' });

      const params = apiService.createCheckoutSession.mock.calls[0][0];
      expect(params).toMatchObject({ locale: 'zh', productName: '高级会员 · 1 个月' });
      expect(params.productDescription).toContain('\u3000');
      expect(params.submitMessage).toContain(String(STEAM_ID));
    });

    it('多月会员与积分包按档位总价下单', async () => {
      await service.createOrder(String(STEAM_ID), {
        productCode: StripeProductCode.MEMBER_PREMIUM,
        quantity: 12,
      });
      await service.createOrder(String(STEAM_ID), {
        productCode: StripeProductCode.POINTS_TIER3,
        locale: 'ru',
      });

      expect(repo.create.mock.calls[0][0]).toMatchObject({ quantity: 12, amountCent: 4299 });
      expect(apiService.createCheckoutSession.mock.calls[0][0]).toMatchObject({
        amountCent: 4299,
        productName: 'Premium Membership · 12 months',
      });
      expect(repo.create.mock.calls[1][0]).toMatchObject({
        productCode: StripeProductCode.POINTS_TIER3,
        quantity: 1,
        amountCent: 8099,
      });
      expect(apiService.createCheckoutSession.mock.calls[1][0].productName).toBe(
        'Member Points · 31\u00a0000',
      );
    });

    it('价格表里没有的份数拒绝下单', async () => {
      await expect(
        service.createOrder(String(STEAM_ID), {
          productCode: StripeProductCode.MEMBER_PREMIUM,
          quantity: 2,
        }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.createOrder(String(STEAM_ID), {
          productCode: StripeProductCode.POINTS_TIER1,
          quantity: 3,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  describe('getOrderStatus', () => {
    it('本人可以查到订单状态', async () => {
      repo.findById.mockResolvedValue(buildOrder({ status: StripeOrderStatus.SUCCESS }));
      await expect(service.getOrderStatus(ORDER_ID, String(STEAM_ID))).resolves.toEqual({
        orderId: ORDER_ID,
        status: StripeOrderStatus.SUCCESS,
        productCode: StripeProductCode.MEMBER_PREMIUM,
        quantity: 1,
        amountCent: 400,
      });
    });

    it('别人的订单与不存在的订单一样回 404', async () => {
      repo.findById.mockResolvedValue(buildOrder());
      await expect(service.getOrderStatus(ORDER_ID, '999')).rejects.toThrow(NotFoundException);
      repo.findById.mockResolvedValue(undefined);
      await expect(service.getOrderStatus(ORDER_ID, String(STEAM_ID))).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('handleWebhook', () => {
    it('验签失败回 400，不读订单', async () => {
      apiService.constructEvent.mockImplementation(() => {
        throw new Error('bad signature');
      });
      await expect(service.handleWebhook(RAW_BODY, 'sig')).rejects.toThrow(BadRequestException);
      await expect(service.handleWebhook(RAW_BODY, undefined)).rejects.toThrow(BadRequestException);
      expect(repo.findById).not.toHaveBeenCalled();
    });

    it('付款成功：发一个月高级会员，订单改为 SUCCESS，上报 GA4', async () => {
      apiService.constructEvent.mockReturnValue(completedEvent());
      repo.findById.mockResolvedValue(buildOrder());

      await service.handleWebhook(RAW_BODY, 'sig');

      expect(membersService.createMember).toHaveBeenCalledWith(
        { steamId: STEAM_ID, month: 1, level: MemberLevel.PREMIUM },
        { reason: 'stripe_member', ref: ORDER_ID },
      );
      expect(repo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: StripeOrderStatus.SUCCESS,
          paymentIntentId: 'pi_test_1',
          paidAt: new Date(1_800_000_000 * 1000),
        }),
      );
      expect(analytics.stripePurchase).toHaveBeenCalledTimes(1);
    });

    it('多月会员按月数开通，积分包发放对应积分', async () => {
      apiService.constructEvent.mockReturnValue(completedEvent({ amount_total: 12199 }));
      repo.findById.mockResolvedValue(buildOrder({ quantity: 36, amountCent: 12199 }));
      await service.handleWebhook(RAW_BODY, 'sig');
      expect(membersService.createMember).toHaveBeenCalledWith(
        { steamId: STEAM_ID, month: 36, level: MemberLevel.PREMIUM },
        { reason: 'stripe_member', ref: ORDER_ID },
      );

      apiService.constructEvent.mockReturnValue(completedEvent({ amount_total: 3399 }));
      repo.findById.mockResolvedValue(
        buildOrder({ productCode: StripeProductCode.POINTS_TIER2, amountCent: 3399 }),
      );
      await service.handleWebhook(RAW_BODY, 'sig');
      expect(playerService.upsertAddPoint).toHaveBeenCalledWith(
        STEAM_ID,
        { memberPointTotal: 12500 },
        { reason: 'stripe_points', ref: ORDER_ID },
      );
    });

    it.each([
      ['其他事件类型', { ...completedEvent(), type: 'charge.refunded' }, buildOrder()],
      ['不是本系统建的收银台', completedEvent({ client_reference_id: null }), buildOrder()],
      ['订单不存在', completedEvent(), undefined],
      [
        '订单已成功（重复通知）',
        completedEvent(),
        buildOrder({ status: StripeOrderStatus.SUCCESS }),
      ],
      ['未付款', completedEvent({ payment_status: 'unpaid' }), buildOrder()],
      ['金额不符', completedEvent({ amount_total: 100 }), buildOrder()],
      ['币种不符', completedEvent({ currency: 'jpy' }), buildOrder()],
    ])('%s：正常返回，不发放', async (_name, event, order) => {
      apiService.constructEvent.mockReturnValue(event);
      repo.findById.mockResolvedValue(order);

      await expect(service.handleWebhook(RAW_BODY, 'sig')).resolves.toBeUndefined();

      expect(membersService.createMember).not.toHaveBeenCalled();
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('发放失败时抛错让 Stripe 重试，订单保持 WAITING', async () => {
      apiService.constructEvent.mockReturnValue(completedEvent());
      repo.findById.mockResolvedValue(buildOrder());
      membersService.createMember.mockRejectedValue(new Error('firestore down'));

      await expect(service.handleWebhook(RAW_BODY, 'sig')).rejects.toThrow('firestore down');
      expect(repo.update).not.toHaveBeenCalled();
    });
  });
});
