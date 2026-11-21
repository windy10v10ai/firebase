import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { logger } from 'firebase-functions';

export enum SERVER_TYPE {
  WINDY = 'WINDY',
  LOCAL = 'LOCAL',
  LAUNCHER = 'LAUNCHER',
  WEB = 'WEB',
  UNKNOWN = 'UNKNOWN',
}

export enum SECRET {
  AFDIAN_WEBHOOK_TOKEN = 'AFDIAN_WEBHOOK_TOKEN',
  AFDIAN_API_TOKEN = 'AFDIAN_API_TOKEN',
  SERVER_APIKEY = 'SERVER_APIKEY',
  LOCAL_APIKEY_A = 'LOCAL_APIKEY_A',
  LOCAL_APIKEY_B = 'LOCAL_APIKEY_B',
  LAUNCHER_APIKEY = 'LAUNCHER_APIKEY',
  GA4_API_SECRET = 'GA4_API_SECRET',
  KOFI_VERIFICATION_TOKEN = 'KOFI_VERIFICATION_TOKEN',
  ALIPAY_APP_ID = 'ALIPAY_APP_ID',
  ALIPAY_APP_PRIVATE_KEY = 'ALIPAY_APP_PRIVATE_KEY',
  ALIPAY_PUBLIC_KEY = 'ALIPAY_PUBLIC_KEY',
  STRIPE_SECRET_KEY = 'STRIPE_SECRET_KEY',
  STRIPE_WEBHOOK_SECRET = 'STRIPE_WEBHOOK_SECRET',
  STEAM_WEB_API_KEY = 'STEAM_WEB_API_KEY',
  LAUNCHER_RELAY_PRIVATE_KEY = 'LAUNCHER_RELAY_PRIVATE_KEY',
}

@Injectable()
export class SecretService {
  getSecretValue(key: SECRET): string {
    const value = process.env[key];
    if (!value) {
      logger.error(`Secret value for ${key} is not defined`);
      throw new InternalServerErrorException('Secret value is not defined');
    }
    return value;
  }

  getServerTypeByApiKey(apiKey: string): SERVER_TYPE {
    const windyKey = this.getSecretValue(SECRET.SERVER_APIKEY);
    if (apiKey === windyKey) {
      return SERVER_TYPE.WINDY;
    }
    // 两个槽位同时有效，换 key 时未更新的玩家不受影响
    const localKeys = [
      this.getSecretValue(SECRET.LOCAL_APIKEY_A),
      this.getSecretValue(SECRET.LOCAL_APIKEY_B),
    ];
    if (localKeys.includes(apiKey)) {
      return SERVER_TYPE.LOCAL;
    }
    // 启动器是公开分发的 exe，key 等同公开，所以只用一个、不设轮替槽位，防线是路由白名单与限额
    if (apiKey === this.getSecretValue(SECRET.LAUNCHER_APIKEY)) {
      return SERVER_TYPE.LAUNCHER;
    }

    return SERVER_TYPE.UNKNOWN;
  }
}
