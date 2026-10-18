import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { logger } from 'firebase-functions/v2';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';
import Stripe from 'stripe';

import { AnalyticsPurchaseService } from '../analytics/analytics.purchase.service';
import { MembersService } from '../members/members.service';
import { PlayerService } from '../player/player.service';

import { CreateStripeOrderResponseDto } from './dto/create-stripe-order-response.dto';
import { QueryStripeOrderResponseDto } from './dto/query-stripe-order-response.dto';
import { StripeOrder } from './entities/stripe-order.entity';
import { StripeOrderStatus } from './enums/stripe-order-status.enum';
import { StripeProductCode } from './enums/stripe-product-code.enum';
import { StripeApiService } from './stripe.api.service';
import {
  DEFAULT_STRIPE_LOCALE,
  STRIPE_CURRENCY,
  STRIPE_PRODUCT_TABLE,
  StripeLocale,
  joinStripeLines,
  stripeSubmitMessage,
} from './stripe.constants';

// 网站首期只卖这一种，下单接口暂不接受商品与份数
const DEFAULT_PRODUCT_CODE = StripeProductCode.MEMBER_PREMIUM;
const DEFAULT_QUANTITY = 1;

const CHECKOUT_COMPLETED = 'checkout.session.completed';

@Injectable()
export class StripeService {
  constructor(
    private readonly stripeApiService: StripeApiService,
    @InjectRepository(StripeOrder)
    private readonly stripeOrderRepository: BaseFirestoreRepository<StripeOrder>,
    private readonly membersService: MembersService,
    private readonly playerService: PlayerService,
    private readonly analyticsPurchaseService: AnalyticsPurchaseService,
  ) {}

  /** 为当前登录玩家创建订单，返回 Stripe 收银台地址。 */
  async createOrder(
    viewerUid: string | undefined,
    locale: StripeLocale = DEFAULT_STRIPE_LOCALE,
  ): Promise<CreateStripeOrderResponseDto> {
    // 订单归属只认网站登录身份，游戏服务器的 key 调不了
    if (!viewerUid) {
      throw new UnauthorizedException();
    }
    const webOrigin = process.env.WEB_ORIGIN;
    if (!webOrigin) {
      logger.error('[Stripe] WEB_ORIGIN 未配置');
      throw new InternalServerErrorException('WEB_ORIGIN is not defined');
    }

    const productCode = DEFAULT_PRODUCT_CODE;
    const quantity = DEFAULT_QUANTITY;
    const spec = STRIPE_PRODUCT_TABLE[productCode];
    const steamId = Number(viewerUid);
    const orderId = this.generateOrderId(steamId);
    const now = new Date();
    // 先落库再建收银台，回调到达时一定查得到订单
    const order = await this.stripeOrderRepository.create({
      id: orderId,
      steamId,
      productCode,
      quantity,
      amountCent: spec.priceCentPerUnit * quantity,
      currency: STRIPE_CURRENCY,
      status: StripeOrderStatus.WAITING,
      createdAt: now,
      updatedAt: now,
    });

    const session = await this.stripeApiService.createCheckoutSession({
      orderId,
      steamId,
      unitAmountCent: spec.priceCentPerUnit,
      quantity,
      currency: order.currency,
      productName: spec.name[locale],
      productDescription: joinStripeLines(spec.benefits[locale]),
      productImageUrl: `${webOrigin}${spec.imagePath}`,
      submitMessage: stripeSubmitMessage(locale, steamId),
      locale,
      successUrl: `${webOrigin}/membership?stripeOrderId=${orderId}`,
      cancelUrl: `${webOrigin}/membership`,
    });

    order.checkoutSessionId = session.id;
    order.updatedAt = new Date();
    await this.stripeOrderRepository.update(order);

    logger.info('Stripe create order', { orderId, steamId });
    return { orderId, checkoutUrl: session.url };
  }

  /** 查询订单状态，只能查自己的订单。 */
  async getOrderStatus(
    orderId: string,
    viewerUid: string | undefined,
  ): Promise<QueryStripeOrderResponseDto> {
    const order = await this.stripeOrderRepository.findById(orderId);
    // 别人的订单与不存在的订单同样回 404，不暴露订单号是否有效
    if (!order || !viewerUid || String(order.steamId) !== viewerUid) {
      throw new NotFoundException(`Stripe order not found: ${orderId}`);
    }
    return { orderId: order.id, status: order.status };
  }

  /**
   * 处理 Stripe 回调。验签失败抛 400；发放出错时异常冒泡成 5xx，交给 Stripe 重试。
   * 其余无需重试的情况（无关事件、校验不过）都正常返回，避免 Stripe 反复投递。
   */
  async handleWebhook(rawBody: Buffer | undefined, signature: string | undefined): Promise<void> {
    if (!rawBody || !signature) {
      throw new BadRequestException('missing body or signature');
    }
    let event: Stripe.Event;
    try {
      event = this.stripeApiService.constructEvent(rawBody, signature);
    } catch (err) {
      logger.warn('[Stripe] Webhook 验签失败', { error: (err as Error).message });
      throw new BadRequestException('invalid signature');
    }

    if (event.type !== CHECKOUT_COMPLETED) {
      return;
    }
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.client_reference_id;
    // 同一 Stripe 账号还接着 Ko-fi 等其他收款，不是本系统建的收银台没有订单号
    if (!orderId) {
      return;
    }

    const order = await this.stripeOrderRepository.findById(orderId);
    if (!order) {
      logger.warn('[Stripe] Webhook 订单不存在', { orderId, sessionId: session.id });
      return;
    }
    if (order.status === StripeOrderStatus.SUCCESS) {
      logger.info('[Stripe] Webhook 重复通知，订单已 SUCCESS', { orderId });
      return;
    }
    if (session.payment_status !== 'paid') {
      logger.warn('[Stripe] Webhook 未付款', { orderId, paymentStatus: session.payment_status });
      return;
    }
    if (session.amount_total !== order.amountCent || session.currency !== order.currency) {
      logger.error('[Stripe] Webhook 金额或币种不匹配', {
        orderId,
        amountTotal: session.amount_total,
        currency: session.currency,
        orderAmountCent: order.amountCent,
        orderCurrency: order.currency,
      });
      return;
    }

    await this.applyRewards(order);

    order.status = StripeOrderStatus.SUCCESS;
    order.paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id;
    order.paidAt = new Date(event.created * 1000);
    order.updatedAt = new Date();
    await this.stripeOrderRepository.update(order);

    await this.analyticsPurchaseService.stripePurchase(order);
  }

  /** 按商品表发放：会员一份一个月，积分包按份数倍发。 */
  async applyRewards(order: StripeOrder): Promise<void> {
    const spec = STRIPE_PRODUCT_TABLE[order.productCode];
    if (!spec) {
      throw new InternalServerErrorException(`Unknown productCode: ${order.productCode}`);
    }
    const reward = spec.reward;
    if (reward.kind === 'member') {
      await this.membersService.createMember(
        { steamId: order.steamId, month: order.quantity, level: reward.level },
        { reason: 'stripe_member', ref: order.id },
      );
    } else {
      await this.playerService.upsertAddPoint(
        order.steamId,
        { memberPointTotal: reward.points * order.quantity },
        { reason: 'stripe_points', ref: order.id },
      );
    }
    logger.info('[Stripe] 奖励发放成功', {
      orderId: order.id,
      steamId: order.steamId,
      productCode: order.productCode,
      quantity: order.quantity,
    });
  }

  private generateOrderId(steamId: number): string {
    const rand = Math.random().toString(36).slice(2, 6);
    return `stripe-${steamId}-${Date.now()}-${rand}`;
  }
}
