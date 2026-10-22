import { INestApplication, Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import { logger } from 'firebase-functions';
import { onRequest } from 'firebase-functions/https';
import { defineSecret } from 'firebase-functions/params';
import { onSchedule } from 'firebase-functions/scheduler';

import { AfdianService } from './src/afdian/afdian.service';
import { AppModule, ClientAppModule } from './src/app.module';
import { PlayerStatsRadarService } from './src/player/player-stats-radar.service';
import { SECRET } from './src/util/secret/secret.service';
import { AppGlobalSettings } from './src/util/settings';

type NestServer = { app: INestApplication; server: express.Express };

const createApp = async (module: Type): Promise<NestServer> => {
  const server = express();
  const app = await NestFactory.create(module, new ExpressAdapter(server), {
    bodyParser: false, // 禁用内置的 body parser，避免 router 检测带来的兼容性问题
  });

  AppGlobalSettings(app);
  await app.init();
  return { app, server };
};

// 每个函数的实例只建自己要用的那个应用，部署时 CLI 加载本文件分析函数列表也不会建应用
const lazy = (module: Type) => {
  let ready: Promise<NestServer> | undefined;
  return () => (ready ??= createApp(module));
};
const getClientApp = lazy(ClientAppModule);
const getAdminApp = lazy(AppModule);

const isLocal = process.env.FUNCTIONS_EMULATOR === 'true';

const commonSecrets = isLocal
  ? [defineSecret(SECRET.AFDIAN_API_TOKEN)]
  : [
      defineSecret(SECRET.SERVER_APIKEY),
      defineSecret(SECRET.LOCAL_APIKEY_A),
      defineSecret(SECRET.LOCAL_APIKEY_B),
      defineSecret(SECRET.AFDIAN_WEBHOOK_TOKEN),
      defineSecret(SECRET.AFDIAN_API_TOKEN),
      defineSecret(SECRET.GA4_API_SECRET),
      defineSecret(SECRET.KOFI_VERIFICATION_TOKEN),
      defineSecret(SECRET.ALIPAY_APP_ID),
      defineSecret(SECRET.ALIPAY_APP_PRIVATE_KEY),
      defineSecret(SECRET.ALIPAY_PUBLIC_KEY),
      defineSecret(SECRET.STRIPE_SECRET_KEY),
      defineSecret(SECRET.STRIPE_WEBHOOK_SECRET),
      defineSecret(SECRET.STEAM_WEB_API_KEY),
      defineSecret(SECRET.LAUNCHER_RELAY_PRIVATE_KEY),
    ];

export const client = onRequest(
  {
    region: 'asia-northeast1',
    minInstances: 0,
    maxInstances: 10,
    // 默认的 256MiB 常态占用已接近上限，实例会超限被重启；内存单价远低于 CPU，加倍对费用影响很小
    memory: '512MiB',
    // 缩到零后的第一个请求要等冷启动，超时得把整个冷启动包进去
    timeoutSeconds: 15,
    secrets: commonSecrets,
  },
  async (req, res) => {
    const { server } = await getClientApp();
    server(req, res);
  },
);

// function need authenticated
export const admin = onRequest(
  {
    // 管理接口在应用层是 @Public 的，拦截全靠这里；v2 的默认值是允许匿名调用
    invoker: 'private',
    region: 'asia-northeast1',
    minInstances: 0,
    maxInstances: 1,
    memory: '512MiB',
    timeoutSeconds: 3600,
    secrets: commonSecrets,
  },
  async (req, res) => {
    const { server } = await getAdminApp();
    server(req, res);
  },
);

export const scheduledOrderCheck = onSchedule(
  {
    schedule: 'every 30 minutes',
    region: 'asia-northeast1',
    minInstances: 0,
    maxInstances: 1,
    timeoutSeconds: 540,
    secrets: commonSecrets,
  },
  async () => {
    logger.info('Schedule Function triggered');
    const { app } = await getClientApp();
    const result = await app.get(AfdianService).activeRecentOrder(10);
    if (result.activeTradeNos.length > 0) {
      logger.warn(`Active trade nos: ${result.activeTradeNos}`);
    }
    logger.info('Schedule function finished', result);
  },
);

// 按频率分函数而不是按任务分，每天一次的任务都进这个列表，免得每加一项就多一个函数和调度任务
const DAILY_JOBS: { name: string; run: (app: INestApplication) => Promise<unknown> }[] = [
  { name: 'radarBaseline', run: (app) => app.get(PlayerStatsRadarService).refreshBaseline() },
];

export const dailyJobs = onSchedule(
  {
    // 与每日任务、排行榜的换日时刻对齐，按天切分的汇总都以 UTC 日为界
    schedule: 'every day 00:00',
    timeZone: 'Etc/UTC',
    region: 'asia-northeast1',
    minInstances: 0,
    maxInstances: 1,
    // SDK 把定时函数按事件函数校验，540 是能过部署的上限；只按实际运行时间计费，任务变多时不用再调
    timeoutSeconds: 540,
    secrets: commonSecrets,
  },
  async () => {
    const { app } = await getClientApp();
    for (const job of DAILY_JOBS) {
      // 一项失败不能挡住后面的任务
      try {
        const result = await job.run(app);
        logger.info('Daily job finished', { job: job.name, result });
      } catch (err) {
        logger.error('Daily job failed', {
          job: job.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  },
);
