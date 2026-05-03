import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { AlipayApiService } from './alipay.api.service';
import { ALIPAY_PRODUCT_TABLE, ALIPAY_QR_EXPIRE_MS } from './alipay.constants';
import { CreateAlipayOrderResponseDto } from './dto/create-alipay-order-response.dto';
import { CreateAlipayOrderDto } from './dto/create-alipay-order.dto';
import { AlipayOrder } from './entities/alipay-order.entity';
import { AlipayTradeStatus } from './enums/alipay-trade-status.enum';

@Injectable()
export class AlipayService {
  constructor(
    private readonly alipayApiService: AlipayApiService,
    @InjectRepository(AlipayOrder)
    private readonly alipayOrderRepository: BaseFirestoreRepository<AlipayOrder>,
  ) {}

  async createOrder(dto: CreateAlipayOrderDto): Promise<CreateAlipayOrderResponseDto> {
    const spec = ALIPAY_PRODUCT_TABLE[dto.productCode];
    if (!spec) {
      throw new BadRequestException(`Unknown productCode: ${dto.productCode}`);
    }

    const quantity = dto.quantity ?? 1;
    const totalAmountCent = spec.priceCentPerUnit * quantity;
    const totalAmount = (totalAmountCent / 100).toFixed(2);
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

    // 本地沙箱可在 .env.local 配 ALIPAY_NOTIFY_URL（ngrok 地址），生产用控制台设置
    const notifyUrl = process.env.ALIPAY_NOTIFY_URL;
    const qrCode = await this.alipayApiService.precreate(
      outTradeNo,
      totalAmount,
      subject,
      notifyUrl,
    );

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
