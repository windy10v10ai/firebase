import { AsyncLocalStorage } from 'async_hooks';

import { NextFunction, Request, Response } from 'express';
import { logger } from 'firebase-functions';

interface TimedStep {
  name: string;
  ms: number;
}

interface RequestTimingStore {
  steps: TimedStep[];
}

const storage = new AsyncLocalStorage<RequestTimingStore>();

/** 计量一个处理步骤的耗时，记到当前请求的计时日志里；不在请求内时只执行不记录。 */
export async function timeStep<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const store = storage.getStore();
  if (!store) {
    return fn();
  }
  const startedAt = performance.now();
  try {
    return await fn();
  } finally {
    store.steps.push({ name, ms: Math.round(performance.now() - startedAt) });
  }
}

// 只有包过步骤的请求才写日志，日志量随接入的接口增长，而不是随全部请求增长
export function requestTimingMiddleware(req: Request, res: Response, next: NextFunction) {
  const store: RequestTimingStore = { steps: [] };
  const startedAt = performance.now();
  res.on('finish', () => {
    if (store.steps.length === 0) {
      return;
    }
    logger.info('request timing', {
      // 用路由模板而不是实际路径，路径参数里的 steamId 会把同一个接口拆成无数组
      route: `${req.method} ${req.baseUrl}${req.route?.path ?? req.path}`,
      status: res.statusCode,
      totalMs: Math.round(performance.now() - startedAt),
      steps: store.steps,
    });
  });
  storage.run(store, next);
}
