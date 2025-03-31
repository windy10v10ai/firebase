import { Injectable } from '@nestjs/common';
import { logger } from 'firebase-functions/v2';

import { AfdianOrder } from '../afdian/entities/afdian-order.entity';
import { KofiOrder } from '../kofi/entities/kofi-order.entity';
import { KofiType } from '../kofi/enums/kofi-type.enum';

import { AnalyticsService } from './analytics.service';

type CURRENCY = 'CNY' | 'USD';
type AFFILIATION = 'afdian' | 'kofi';

export interface PurchaseEvent {
  name: string;
  params: {
    items: {
      item_id: string;
      item_name: string;
      affiliation: AFFILIATION;
      price: number;
      currency: CURRENCY;
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
}
