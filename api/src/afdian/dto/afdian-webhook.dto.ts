import { ApiProperty } from '@nestjs/swagger';
import { Equals } from 'class-validator';

export class AfdianWebhookDto {
  @Equals(200)
  @ApiProperty()
  ec: number;
  data: DataDto;
}

export class DataDto {
  @Equals('order')
  type: string;
  order: OrderDto;
}

export class OrderDto {
  out_trade_no: string;
  // 方案ID，如自选，则为空
  plan_id: string;
  user_id: string;
  month: number;
  // 真实付款金额，如有兑换码，则为0.00
  total_amount: string;
  // 显示金额，如有折扣则为折扣前金额
  show_amount: string;
  // status 2 为交易成功。目前仅会推送此类型
  status: number;
  // 订单留言
  remark: string;
  // 0表示常规方案 1表示售卖方案
  product_type: number;
  sku_detail: SkuDetailDto[];
  address_person: string;
  address_phone: string;
  address_address: string;
}

export class SkuDetailDto {
  sku_id: string;
  count: number;
}
