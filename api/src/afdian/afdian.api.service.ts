import * as crypto from 'crypto';

import { Injectable } from '@nestjs/common';
import { logger } from 'firebase-functions/v2';

@Injectable()
export class AfdianApiService {
  constructor() {}

  async fetchAfdianOrderOutTradeNo(outTradeNo: string) {
    const params = { out_trade_no: outTradeNo };
    const response = await this.callAfdianOrderAPI(params);
    return response;
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
