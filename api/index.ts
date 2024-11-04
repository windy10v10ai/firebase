import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import * as express from 'express';
import * as functions from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';

import { AppModule } from './src/app.module';
import { SECRET } from './src/util/secret/secret.service';
import { AppGlobalSettings } from './src/util/settings';

// NestJS app
const server = express();

const promiseApplicationReady = NestFactory.create(
  AppModule,
  new ExpressAdapter(server),
).then((app) => {
  AppGlobalSettings(app);
  return app.init();
});

// Cloud Functions
const clientSecrets = [
  defineSecret(SECRET.SERVER_APIKEY),
  defineSecret(SECRET.SERVER_APIKEY_TEST),
  defineSecret(SECRET.AFDIAN_TOKEN),
  defineSecret(SECRET.GA4_API_SECRET),
];

export const client = onRequest(
  {
    region: 'asia-northeast1',
    minInstances: 0,
    maxInstances: 10,
    timeoutSeconds: 10,
    secrets: clientSecrets,
  },
  async (req, res) => {
    const regex = '^/api/(game|afdian).*';
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
  ...args: [req: functions.https.Request, resp: functions.Response<any>]
) {
  const path = args[0].path;
  if (path.match(regex)) {
    await promiseApplicationReady;
    server(...args);
  } else {
    functions.logger.warn(
      `Abnormal request on API Cloud Function! Path: ${path}`,
    );
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
  },
  async (req, res) => {
    await promiseApplicationReady;
    server(req, res);
  },
);
