import { Body, Controller, Module, Post } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { AppGlobalSettings } from './settings';

@Controller('payload')
class PayloadController {
  @Post()
  receive(@Body() body: { value: string }) {
    return { length: body.value.length };
  }
}

@Module({ controllers: [PayloadController] })
class PayloadModule {}

describe('AppGlobalSettings body parsing', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(PayloadModule, {
      bodyParser: false,
      logger: false,
    });
    AppGlobalSettings(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('accepts daily challenge configuration payloads above the Express default limit', async () => {
    const value = 'x'.repeat(512 * 1024);

    await request(app.getHttpServer())
      .post('/api/payload')
      .send({ value })
      .expect(201)
      .expect({ length: value.length });
  });
});
