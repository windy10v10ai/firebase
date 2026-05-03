import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { AlipaySdk } from 'alipay-sdk';
import { logger } from 'firebase-functions/v2';

import { SECRET, SecretService } from '../util/secret/secret.service';

interface PrecreateResponseData {
  code: string;
  msg: string;
  outTradeNo?: string;
  qrCode?: string;
  subCode?: string;
  subMsg?: string;
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

    // .env 文件不支持多行，PEM 密钥换行符以 \n 字面量存储，此处还原
    const privateKey = this.secretService
      .getSecretValue(SECRET.ALIPAY_APP_PRIVATE_KEY)
      .replace(/\\n/g, '\n');
    const alipayPublicKey = this.secretService
      .getSecretValue(SECRET.ALIPAY_PUBLIC_KEY)
      .replace(/\\n/g, '\n');

    this.sdk = new AlipaySdk({
      appId: this.secretService.getSecretValue(SECRET.ALIPAY_APP_ID),
      privateKey,
      alipayPublicKey,
      signType: 'RSA2',
      gateway,
      charset: 'utf-8',
    });
    return this.sdk;
  }

  async precreate(outTradeNo: string, totalAmount: string, subject: string): Promise<string> {
    const sdk = this.getSdk();
    // notify_url 在支付宝开放平台应用网关里配置，不在 precreate 参数里传
    const result = (await sdk.exec('alipay.trade.precreate', {
      bizContent: {
        out_trade_no: outTradeNo,
        total_amount: totalAmount,
        subject,
      },
    })) as PrecreateResponseData;

    if (result.code !== '10000' || !result.qrCode) {
      logger.error('alipay.trade.precreate 调用失败', { outTradeNo, result });
      throw new InternalServerErrorException(
        `alipay precreate failed: ${result.subMsg || result.msg}`,
      );
    }
    return result.qrCode;
  }
}
