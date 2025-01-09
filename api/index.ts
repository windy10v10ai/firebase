import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import * as functions from 'firebase-functions';
import { logger } from 'firebase-functions';
import { onRequest } from 'firebase-functions/https';
import { defineSecret } from 'firebase-functions/params';
import { onSchedule } from 'firebase-functions/scheduler';

import { AppModule } from './src/app.module';
import { TaskController } from './src/task/task.controller';
import { SECRET } from './src/util/secret/secret.service';
import { AppGlobalSettings } from './src/util/settings';

// NestJS app
const server = express();

const promiseApplicationReady = NestFactory.create(AppModule, new ExpressAdapter(server)).then(
  (app) => {
    AppGlobalSettings(app);
    return app.init();
  },
);

const isLocal = process.env.FUNCTIONS_EMULATOR === 'true';

const commonSecrets = isLocal
  ? [defineSecret(SECRET.AFDIAN_API_TOKEN)]
  : [
      defineSecret(SECRET.SERVER_APIKEY),
      defineSecret(SECRET.SERVER_APIKEY_TEST),
      defineSecret(SECRET.AFDIAN_WEBHOOK_TOKEN),
      defineSecret(SECRET.AFDIAN_API_TOKEN),
      defineSecret(SECRET.GA4_API_SECRET),
    ];

export const client = onRequest(
  {
    region: 'asia-northeast1',
    minInstances: 0,
    maxInstances: 10,
    timeoutSeconds: 10,
    secrets: commonSecrets,
  },
  async (req, res) => {
    const regex = '^/api/(game|afdian|analytics).*';
    callServerWithRegex(regex, req, res);
  },
);

export const patreon = onRequest(
  {
    region: 'asia-northeast1',
    minInstances: 0,
    maxInstances: 1,
    timeoutSeconds: 60,
    secrets: [defineSecret(SECRET.PATREON_SECRET)],
  },
  async (req, res) => {
    const regex = '^/api/patreon.*';
    callServerWithRegex(regex, req, res);
  },
);

async function callServerWithRegex(
  regex: string,
  ...args: [req: functions.https.Request, resp: express.Response]
) {
  const path = args[0].path;
  if (path.match(regex)) {
    await promiseApplicationReady;
    server(...args);
  } else {
    functions.logger.warn(`Abnormal request on API Cloud Function! Path: ${path}`);
    args[1].status(403).send('Invalid path');
  }
}

// function need authenticated
export const admin = onRequest(
  {
    region: 'asia-northeast1',
    minInstances: 0,
    maxInstances: 1,
    timeoutSeconds: 1800,
    secrets: commonSecrets,
  },
  async (req, res) => {
    await promiseApplicationReady;
    server(req, res);
  },
);

export const scheduledOrderCheck = onSchedule(
  {
    schedule: 'every 30 minutes',
    region: 'asia-northeast1',
    minInstances: 0,
    maxInstances: 1,
    timeoutSeconds: 1800,
    secrets: commonSecrets,
  },
  async () => {
    logger.info('Schedule Function triggered');
    const app = await promiseApplicationReady;
    const task = app.get(TaskController);
    const result = await task.activeRecentOrder(10);
    if (result.activeTradeNos.length > 0) {
      logger.warn(`Active trade nos: ${result.activeTradeNos}`);
    }
    logger.info('Schedule function finished', result);
  },
);
