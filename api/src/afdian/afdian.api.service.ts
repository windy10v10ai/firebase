import * as crypto from 'crypto';

import { Injectable } from '@nestjs/common';
import { logger } from 'firebase-functions/v2';

import { OrderDto } from './dto/afdian-webhook.dto';

interface AfdianQueryOrderResponse {
  ec: number;
  em: string;
  data: {
    list: OrderDto[];
    total_count: number;
    total_page: number;
  };
}

@Injectable()
export class AfdianApiService {
  constructor() {}

  /**
   * 获取最近的爱发电订单
   *
   * @param page - 页码
   * @param perPage - 每页数量，默认20，支持1-100
   * @returns
   */
  async fetchAfdianOrders(page: number, perPage: number): Promise<OrderDto[]> {
    const params = { page, per_page: perPage };
    const response = await this.callAfdianOrderAPI(params);
    return response.data.list;
  }

  async fetchAfdianOrderByOutTradeNo(outTradeNo: string) {
    const params = { out_trade_no: outTradeNo };
    const response = await this.callAfdianOrderAPI(params);
    return response.data.list[0];
  }

  private async callAfdianOrderAPI(params: object): Promise<AfdianQueryOrderResponse> {
    const token = process.env.AFDIAN_API_TOKEN;
    const userId = process.env.AFDIAN_USER_ID;
    const paramsString = JSON.stringify(params);
    const ts = Math.floor(Date.now() / 1000);

    const signString = `${token}params${paramsString}ts${ts}user_id${userId}`;
    const sign = md5(signString);

    const requestBody = {
      user_id: userId,
      params: paramsString,
      ts,
      sign,
    };

    const response = await fetch('https://afdian.com/api/open/query-order', {
      method: 'POST',
      body: JSON.stringify(requestBody),
      headers: { 'Content-Type': 'application/json' },
    });
    const responseJson = await response.json();
    if (responseJson.ec !== 200) {
      logger.error('Afdian API error', responseJson);
      throw new Error(`Afdian API error: ${responseJson.em}`);
    }
    return responseJson;
  }
}

function md5(data: string): string {
  return crypto.createHash('md5').update(data).digest('hex');
}
