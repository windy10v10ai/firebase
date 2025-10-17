import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { logger } from 'firebase-functions';

export enum SERVER_TYPE {
  WINDY = 'WINDY',
  TEST = 'TEST',
  TENVTEN = 'TENVTEN',
  LOCAL = 'LOCAL',
  UNKNOWN = 'UNKNOWN',
}

export enum SECRET {
  AFDIAN_WEBHOOK_TOKEN = 'AFDIAN_WEBHOOK_TOKEN',
  AFDIAN_API_TOKEN = 'AFDIAN_API_TOKEN',
  SERVER_APIKEY = 'SERVER_APIKEY',
  SERVER_APIKEY_TEST = 'SERVER_APIKEY_TEST',
  SERVER_APIKEY_TENVTEN = 'SERVER_APIKEY_TENVTEN',
  GA4_API_SECRET = 'GA4_API_SECRET',
  KOFI_VERIFICATION_TOKEN = 'KOFI_VERIFICATION_TOKEN',
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
    if (apiKey === 'Invalid_NotOnDedicatedServer') {
      return SERVER_TYPE.LOCAL;
    }

    const windyKey = this.getSecretValue(SECRET.SERVER_APIKEY);
    if (apiKey === windyKey) {
      return SERVER_TYPE.WINDY;
    }
    const testKey = this.getSecretValue(SECRET.SERVER_APIKEY_TEST);
    if (apiKey === testKey) {
      return SERVER_TYPE.TEST;
    }
    const tenvtenKey = this.getSecretValue(SECRET.SERVER_APIKEY_TENVTEN);
    if (apiKey === tenvtenKey) {
      return SERVER_TYPE.TENVTEN;
    }

    return SERVER_TYPE.UNKNOWN;
  }
}
