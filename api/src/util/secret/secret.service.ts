import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { logger } from 'firebase-functions';

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
}
