import * as crypto from 'crypto';

import { Injectable } from '@nestjs/common';
import { logger } from 'firebase-functions/v2';

import { AfdianService } from './afdian.service';
import { OrderDto } from './dto/afdian-webhook.dto';

@Injectable()
export class AfdianApiService {
  constructor(private readonly afdianService: AfdianService) {}

  async fetchAllAfdianOrder() {
    let page = 1;
    let totalPage = 1;
    while (page <= totalPage) {
      totalPage = await this.fetchAfdianOrder(page);
      page++;
    }
  }

  async fetchAfdianOrder(page: number) {
    const params = { page, per_page: 100 };
    const response = await this.callAfdianOrderAPI(params);

    const data = response.data;
    const list = data.list as OrderDto[];
    const totalCount = data.total_count;
    const totalPage = data.total_page;

    logger.info(
      `Afdian order fetch: page=${page}, total=${totalCount}, totalPage=${totalPage}, list=${list.length}`,
    );

    // record order if not exist
    for (const order of list) {
      const result = await this.afdianService.recordAfdianOrderIfNotExist(order);
      if (result) {
        logger.info(`Afdian order recorded: ${order.out_trade_no}`);
      }
    }

    return totalPage;
  }

  private async callAfdianOrderAPI(params: object) {
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
