import { Injectable } from '@nestjs/common';
import { logger } from 'firebase-functions/v2';

import { AfdianOrder } from '../afdian/entities/afdian-order.entity';

import { AnalyticsService } from './analytics.service';

type CURRENCY = 'CNY' | 'USD';
type AFFILIATION = 'afdian';

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

  async purchase(afdianOrder: AfdianOrder) {
    const event = this.buildPurchaseEvent(afdianOrder);

    await this.analyticsService.sendEvent(afdianOrder.steamId.toString(), event);
  }

  private buildPurchaseEvent(afdianOrder: AfdianOrder): PurchaseEvent {
    const price = Number(afdianOrder.orderDto.total_amount);
    if (isNaN(price)) {
      logger.error('Invalid price', afdianOrder.orderDto.total_amount);
      return undefined;
    }

    return {
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
  }
}
