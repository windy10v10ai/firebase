import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { AlipayApiService } from './alipay.api.service';
import { ALIPAY_PRODUCT_TABLE, ALIPAY_QR_EXPIRE_MS, AlipayProductSpec } from './alipay.constants';
import { CreateAlipayOrderResponseDto } from './dto/create-alipay-order-response.dto';
import { CreateAlipayOrderDto } from './dto/create-alipay-order.dto';
import { AlipayOrder } from './entities/alipay-order.entity';
import { AlipayProductCode } from './enums/alipay-product-code.enum';
import { AlipayTradeStatus } from './enums/alipay-trade-status.enum';

@Injectable()
export class AlipayService {
  constructor(
    private readonly alipayApiService: AlipayApiService,
    @InjectRepository(AlipayOrder)
    private readonly alipayOrderRepository: BaseFirestoreRepository<AlipayOrder>,
  ) {}

  async createOrder(dto: CreateAlipayOrderDto): Promise<CreateAlipayOrderResponseDto> {
    const quantity = dto.quantity ?? 1;
    const { spec, totalAmountCent, totalAmount } = this.calculatePrice(dto.productCode, quantity);
    const subject = this.buildSubject(spec.subjectUnit, spec.reward.kind, quantity);

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

  /**
   * 计算订单价格。独立成 method 以便后续接入折扣（多份阶梯、首充优惠、活动价等）：
   * 折扣逻辑只需在此处加，调用方（createOrder / 未来的 GET /price 端点）无需感知。
   */
  calculatePrice(
    productCode: AlipayProductCode,
    quantity: number,
  ): { spec: AlipayProductSpec; totalAmountCent: number; totalAmount: string } {
    const spec = ALIPAY_PRODUCT_TABLE[productCode];
    if (!spec) {
      throw new BadRequestException(`Unknown productCode: ${productCode}`);
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new BadRequestException(`Invalid quantity: ${quantity}`);
    }
    const totalAmountCent = spec.priceCentPerUnit * quantity;
    const totalAmount = (totalAmountCent / 100).toFixed(2);
    return { spec, totalAmountCent, totalAmount };
  }

  private buildSubject(subjectUnit: string, kind: string, quantity: number): string {
    if (quantity <= 1) {
      return subjectUnit;
    }
    if (kind === 'member') {
      return `${subjectUnit} ${quantity}个月`;
    }
    return `${subjectUnit} ${quantity}份`;
  }

  private generateOutTradeNo(steamId: number): string {
    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2, 6);
    return `ali-${steamId}-${ts}-${rand}`;
  }
}
