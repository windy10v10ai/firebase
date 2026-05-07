import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { logger } from 'firebase-functions/v2';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { AnalyticsPurchaseService } from '../analytics/analytics.purchase.service';
import { MembersService } from '../members/members.service';
import { PlayerService } from '../player/player.service';

import { AlipayApiService } from './alipay.api.service';
import { ALIPAY_PRODUCT_TABLE, ALIPAY_QR_EXPIRE_MS, AlipayProductSpec } from './alipay.constants';
import { AlipayNotifyDto } from './dto/alipay-notify.dto';
import { CreateAlipayOrderResponseDto } from './dto/create-alipay-order-response.dto';
import { CreateAlipayOrderDto } from './dto/create-alipay-order.dto';
import { QueryAlipayOrderResponseDto } from './dto/query-alipay-order-response.dto';
import { AlipayOrder } from './entities/alipay-order.entity';
import { AlipayTradeStatus } from './enums/alipay-trade-status.enum';

const ALIPAY_TRADE_SUCCESS = 'TRADE_SUCCESS';
const ALIPAY_TRADE_FINISHED = 'TRADE_FINISHED';
const WEBHOOK_RESPONSE_SUCCESS = 'success';
const WEBHOOK_RESPONSE_FAILURE = 'failure';

@Injectable()
export class AlipayService {
  constructor(
    private readonly alipayApiService: AlipayApiService,
    @InjectRepository(AlipayOrder)
    private readonly alipayOrderRepository: BaseFirestoreRepository<AlipayOrder>,
    private readonly membersService: MembersService,
    private readonly playerService: PlayerService,
    private readonly analyticsPurchaseService: AnalyticsPurchaseService,
  ) {}

  async createOrder(dto: CreateAlipayOrderDto): Promise<CreateAlipayOrderResponseDto> {
    const spec = ALIPAY_PRODUCT_TABLE[dto.productCode];
    if (!spec) {
      throw new BadRequestException(`Unknown productCode: ${dto.productCode}`);
    }
    const quantity = dto.quantity ?? 1;
    const { totalAmountCent, totalAmount } = this.calculatePrice(spec, quantity);
    const subject = this.buildSubject(spec, quantity);

    const outTradeNo = this.generateOutTradeNo(dto.steamId);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ALIPAY_QR_EXPIRE_MS);

    // 先落库 WAITING（无 qrCode），确保 webhook 到达时一定能查到订单；
    // precreate 成功后再 update 写入 qrCode，避免「二维码已生效但本地无记录」导致丢单。
    const order = await this.alipayOrderRepository.create({
      id: outTradeNo,
      outTradeNo,
      steamId: dto.steamId,
      productCode: dto.productCode,
      quantity,
      totalAmountCent,
      subject,
      status: AlipayTradeStatus.WAITING,
      qrCode: '',
      qrCodeExpiresAt: expiresAt,
      createdAt: now,
      updatedAt: now,
    });

    const qrCode = await this.alipayApiService.precreate(outTradeNo, totalAmount, subject);

    order.qrCode = qrCode;
    order.updatedAt = new Date();
    await this.alipayOrderRepository.update(order);

    return {
      outTradeNo,
      qrCode,
      totalAmount,
      subject,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async getOrderStatus(outTradeNo: string): Promise<QueryAlipayOrderResponseDto> {
    const order = await this.alipayOrderRepository.findById(outTradeNo);
    if (!order) {
      throw new NotFoundException(`Alipay order not found: ${outTradeNo}`);
    }
    return { outTradeNo: order.outTradeNo, status: order.status };
  }

  /**
   * 处理支付宝异步通知。返回值为给支付宝的纯文本响应（'success' / 'failure'）。
   *
   * 安全顺序硬性要求：
   *   1. 验签必须在任何 Firestore 读写、任何对 trade_status / total_amount /
   *      buyer_* 字段的信任使用之前完成。
   *   2. 验签失败立即返回 'failure'，不做任何状态变更。
   *
   * 业务流程：
   *   验签 → 必填字段 → 查订单 → 幂等命中（SUCCESS）即返回 → 校验
   *   trade_status / 金额 → 应用奖励 → 写订单 SUCCESS → GA4 事件 → 'success'
   */
  async handleWebhook(notify: AlipayNotifyDto): Promise<string> {
    if (!this.alipayApiService.verifyNotifySign(notify)) {
      logger.warn('[Alipay] Webhook 验签失败', { outTradeNo: notify.out_trade_no });
      return WEBHOOK_RESPONSE_FAILURE;
    }

    const outTradeNo = notify.out_trade_no;
    const tradeStatus = notify.trade_status;
    const totalAmountStr = notify.total_amount;
    if (!outTradeNo || !tradeStatus || !totalAmountStr) {
      logger.warn('[Alipay] Webhook 缺少必填字段', {
        outTradeNo,
        tradeStatus,
        totalAmount: totalAmountStr,
      });
      return WEBHOOK_RESPONSE_FAILURE;
    }

    const order = await this.alipayOrderRepository.findById(outTradeNo);
    if (!order) {
      logger.warn('[Alipay] Webhook 订单不存在', { outTradeNo });
      return WEBHOOK_RESPONSE_FAILURE;
    }

    // 幂等：已 SUCCESS 直接回 success，不重复发奖
    if (order.status === AlipayTradeStatus.SUCCESS) {
      logger.info('[Alipay] Webhook 重复通知，订单已 SUCCESS', { outTradeNo });
      return WEBHOOK_RESPONSE_SUCCESS;
    }

    if (tradeStatus !== ALIPAY_TRADE_SUCCESS && tradeStatus !== ALIPAY_TRADE_FINISHED) {
      logger.warn('[Alipay] Webhook trade_status 非成功', { outTradeNo, tradeStatus });
      return WEBHOOK_RESPONSE_FAILURE;
    }

    // total_amount 单位「元」，订单存的是分；按分比对避免浮点误差
    const notifyAmountCent = Math.round(Number(totalAmountStr) * 100);
    if (!Number.isFinite(notifyAmountCent) || notifyAmountCent !== order.totalAmountCent) {
      logger.error('[Alipay] Webhook 金额不匹配', {
        outTradeNo,
        notifyAmount: totalAmountStr,
        orderAmountCent: order.totalAmountCent,
      });
      return WEBHOOK_RESPONSE_FAILURE;
    }

    await this.applyRewards(order);

    order.status = AlipayTradeStatus.SUCCESS;
    order.alipayTradeNo = notify.trade_no;
    order.buyerUserId = notify.buyer_id;
    order.buyerLogonId = notify.buyer_logon_id;
    order.gmtPayment = this.parseAlipayDateTime(notify.gmt_payment);
    order.rawNotify = { ...notify };
    order.updatedAt = new Date();
    await this.alipayOrderRepository.update(order);

    await this.analyticsPurchaseService.alipayPurchase(order);

    return WEBHOOK_RESPONSE_SUCCESS;
  }

  /**
   * 根据 productCode 调用对应的奖励服务。
   * - member: MembersService.createMember（month=quantity）
   * - points: PlayerService.upsertAddPoint（积分按 quantity 倍发）
   */
  async applyRewards(order: AlipayOrder): Promise<void> {
    const spec = ALIPAY_PRODUCT_TABLE[order.productCode];
    if (!spec) {
      throw new BadRequestException(`Unknown productCode: ${order.productCode}`);
    }
    const reward = spec.reward;
    if (reward.kind === 'member') {
      await this.membersService.createMember({
        steamId: order.steamId,
        month: order.quantity,
        level: reward.level,
      });
      logger.info('[Alipay] 奖励发放成功 - 会员', {
        outTradeNo: order.outTradeNo,
        steamId: order.steamId,
        productCode: order.productCode,
        quantity: order.quantity,
        level: reward.level,
        month: order.quantity,
      });
    } else {
      const points = reward.points * order.quantity;
      await this.playerService.upsertAddPoint(order.steamId, {
        memberPointTotal: points,
      });
      logger.info('[Alipay] 奖励发放成功 - 积分', {
        outTradeNo: order.outTradeNo,
        steamId: order.steamId,
        productCode: order.productCode,
        quantity: order.quantity,
        points,
      });
    }
  }

  /**
   * 计算订单价格。独立成 method 以便后续接入折扣（多份阶梯、首充优惠、活动价等）：
   * 折扣逻辑只需在此处加，调用方无需感知。
   */
  calculatePrice(
    spec: AlipayProductSpec,
    quantity: number,
  ): { totalAmountCent: number; totalAmount: string } {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new BadRequestException(`Invalid quantity: ${quantity}`);
    }
    const totalAmountCent = spec.priceCentPerUnit * quantity;
    const totalAmount = (totalAmountCent / 100).toFixed(2);
    return { totalAmountCent, totalAmount };
  }

  private buildSubject(spec: AlipayProductSpec, quantity: number): string {
    if (quantity <= 1) {
      return spec.subjectUnit;
    }
    if (spec.reward.kind === 'member') {
      // 12/24/36... 月按整年显示，其余按月
      if (quantity % 12 === 0) {
        return `${spec.subjectUnit} ${quantity / 12}年`;
      }
      return `${spec.subjectUnit} ${quantity}个月`;
    }
    return `${spec.subjectUnit} ${quantity}份`;
  }

  private generateOutTradeNo(steamId: number): string {
    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2, 6);
    return `ali-${steamId}-${ts}-${rand}`;
  }

  /**
   * 支付宝下行的 gmt_payment 是「YYYY-MM-DD HH:mm:ss」北京时间字符串。
   * Cloud Functions 默认 UTC 时区，直接 new Date(str) 会被当成 UTC，导致存储时间晚 8 小时。
   * 显式拼上 +08:00 偏移再解析，确保 Date 对象指向真实 UTC 时刻。
   */
  private parseAlipayDateTime(value: string | undefined): Date | undefined {
    if (!value) {
      return undefined;
    }
    const date = new Date(`${value.replace(' ', 'T')}+08:00`);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
}
