import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { AppGlobalSettings } from '../../src/util/settings';

export async function initTest(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  AppGlobalSettings(app);
  return await app.init();
}

export function get(app: INestApplication, url: string, query: object = {}): request.Test {
  const headers = {
    'x-api-key': 'Invalid_NotOnDedicatedServer',
    'x-country-code': 'CN',
  };
  return request(app.getHttpServer()).get(url).query(query).set(headers);
}

export function post(app: INestApplication, url: string, body: object): request.Test {
  const headers = {
    'x-api-key': 'Invalid_NotOnDedicatedServer',
  };
  return request(app.getHttpServer()).post(url).send(body).set(headers);
}

export function put(app: INestApplication, url: string, body: object): request.Test {
  return request(app.getHttpServer()).put(url).send(body);
}

export function patch(app: INestApplication, url: string, body: object): request.Test {
  return request(app.getHttpServer()).patch(url).send(body);
}

export function mockDate(date: string): void {
  const fackTimer = getFakeTimer();
  fackTimer.setSystemTime(new Date(date));
}

export function restoreDate(): void {
  jest.useRealTimers();
}

function getFakeTimer(): typeof jest {
  return jest.useFakeTimers({
    doNotFake: [
      'nextTick',
      'setImmediate',
      'clearImmediate',
      'setInterval',
      'clearInterval',
      'setTimeout',
      'clearTimeout',
    ],
  });
}
