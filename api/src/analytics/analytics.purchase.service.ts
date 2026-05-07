import { Injectable } from '@nestjs/common';

import { AfdianOrder } from '../afdian/entities/afdian-order.entity';
import { OrderType } from '../afdian/enums/order-type.enum';
import { AlipayOrder } from '../alipay/entities/alipay-order.entity';
import { KofiOrder } from '../kofi/entities/kofi-order.entity';
import { KofiType } from '../kofi/enums/kofi-type.enum';

import { AnalyticsService } from './analytics.service';

type CURRENCY = 'CNY' | 'USD';
type AFFILIATION = 'afdian' | 'kofi' | 'alipay';

export interface PurchaseEvent {
  name: string;
  params: {
    items: {
      item_id: string;
      item_name: string;
      affiliation: AFFILIATION;
      price: number;
      currency: CURRENCY;
      quantity: number;
    }[];
    affiliation: AFFILIATION;
    currency: CURRENCY;
    transaction_id: string;
    value: number;
  };
}

@Injectable()
export class AnalyticsPurchaseService {
  constructor(private readonly analyticsService: AnalyticsService) {}

  async afdianPurchase(afdianOrder: AfdianOrder) {
    const price = Number(afdianOrder.orderDto.total_amount);
    const orderType = afdianOrder.orderType;
    const isMember = orderType === OrderType.memberNormal || orderType === OrderType.memberPremium;
    const quantity = isMember
      ? afdianOrder.orderDto.month
      : Number(afdianOrder.orderDto.sku_detail[0]?.count ?? 1);

    const event: PurchaseEvent = {
      name: 'purchase',
      params: {
        items: [
          {
            item_id: afdianOrder.orderDto.plan_id,
            item_name: `afdian-${afdianOrder.orderType}`,
            affiliation: 'afdian',
            price,
            currency: 'CNY',
            quantity,
          },
        ],
        affiliation: 'afdian',
        currency: 'CNY',
        transaction_id: afdianOrder.outTradeNo,
        value: price,
      },
    };

    await this.analyticsService.sendEvent(afdianOrder.steamId.toString(), event);
  }

  async kofiPurchase(order: KofiOrder) {
    const price = order.amount;

    let item_name = '';
    let item_id = '';
    switch (order.type) {
      case KofiType.DONATION:
        item_name = `kofi-donation`;
        item_id = 'kofi-donation';
        break;
      case KofiType.SUBSCRIPTION:
        if (order.tierName) {
          item_name = `kofi-subscription-${order.tierName}`;
          item_id = `kofi-subscription-${order.tierName}`;
        } else {
          item_name = `kofi-subscription`;
          item_id = 'kofi-subscription';
        }
        break;
      case KofiType.SHOP_ORDER:
        item_name = `kofi-shop-order`;
        item_id = 'kofi-shop-order';
        break;
    }
    const quantity =
      order.type === KofiType.SHOP_ORDER
        ? (order.shopItems?.[0]?.quantity ?? 1)
        : Number((order.amount / 4).toFixed(1));

    const event: PurchaseEvent = {
      name: 'purchase',
      params: {
        items: [
          {
            item_id,
            item_name,
            affiliation: 'kofi',
            price,
            currency: 'USD',
            quantity,
          },
        ],
        affiliation: 'kofi',
        currency: 'USD',
        transaction_id: order.messageId,
        value: price,
      },
    };

    await this.analyticsService.sendEvent(order.steamId.toString(), event);
  }

  async alipayPurchase(order: AlipayOrder) {
    const price = order.totalAmountCent / 100;

    const event: PurchaseEvent = {
      name: 'purchase',
      params: {
        items: [
          {
            item_id: order.productCode,
            item_name: `alipay-${order.productCode}`,
            affiliation: 'alipay',
            price,
            currency: 'CNY',
            quantity: order.quantity,
          },
        ],
        affiliation: 'alipay',
        currency: 'CNY',
        transaction_id: order.outTradeNo,
        value: price,
      },
    };

    await this.analyticsService.sendEvent(order.steamId.toString(), event);
  }
}
