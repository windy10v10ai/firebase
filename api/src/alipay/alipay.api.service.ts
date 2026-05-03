import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { AlipaySdk } from 'alipay-sdk';
import { logger } from 'firebase-functions/v2';

import { SECRET, SecretService } from '../util/secret/secret.service';

interface PrecreateResponseData {
  code: string;
  msg: string;
  out_trade_no?: string;
  qr_code?: string;
  sub_code?: string;
  sub_msg?: string;
}

@Injectable()
export class AlipayApiService {
  private sdk?: AlipaySdk;

  constructor(private readonly secretService: SecretService) {}

  private getSdk(): AlipaySdk {
    if (this.sdk) {
      return this.sdk;
    }
    const env = process.env.ALIPAY_ENV ?? 'sandbox';
    const gateway =
      env === 'prod'
        ? 'https://openapi.alipay.com/gateway.do'
        : 'https://openapi-sandbox.dl.alipaydev.com/gateway.do';

    this.sdk = new AlipaySdk({
      appId: this.secretService.getSecretValue(SECRET.ALIPAY_APP_ID),
      privateKey: this.secretService.getSecretValue(SECRET.ALIPAY_APP_PRIVATE_KEY),
      alipayPublicKey: this.secretService.getSecretValue(SECRET.ALIPAY_PUBLIC_KEY),
      signType: 'RSA2',
      gateway,
      charset: 'utf-8',
    });
    return this.sdk;
  }

  async precreate(
    outTradeNo: string,
    totalAmount: string,
    subject: string,
    notifyUrl?: string,
  ): Promise<string> {
    const sdk = this.getSdk();
    const result = (await sdk.exec('alipay.trade.precreate', {
      ...(notifyUrl ? { notify_url: notifyUrl } : {}),
      bizContent: {
        out_trade_no: outTradeNo,
        total_amount: totalAmount,
        subject,
      },
    })) as PrecreateResponseData;

    if (result.code !== '10000' || !result.qr_code) {
      logger.error('alipay.trade.precreate 调用失败', { outTradeNo, result });
      throw new InternalServerErrorException(
        `alipay precreate failed: ${result.sub_msg || result.msg}`,
      );
    }
    return result.qr_code;
  }
}
