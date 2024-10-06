import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { logger } from 'firebase-functions';

export enum SECRET {
  AFDIAN_TOKEN = 'AFDIAN_TOKEN',
  PATREON_SECRET = 'PATREON_SECRET',
  SERVER_APIKEY = 'SERVER_APIKEY',
  SERVER_APIKEY_TEST = 'SERVER_APIKEY_TEST',
  GA4_API_SECRET = 'GA4_API_SECRET',
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
