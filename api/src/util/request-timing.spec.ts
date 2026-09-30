import { EventEmitter } from 'events';

import { Request, Response } from 'express';
import { logger } from 'firebase-functions';

import { requestTimingMiddleware, timeStep } from './request-timing';

function runRequest(handler: () => Promise<void>) {
  const req = {
    method: 'GET',
    baseUrl: '',
    path: '/api/player/123/info',
    route: { path: '/api/player/:steamId/info' },
  } as unknown as Request;
  const res = Object.assign(new EventEmitter(), { statusCode: 200 }) as unknown as Response;
  return new Promise<void>((resolve) => {
    requestTimingMiddleware(req, res, () => {
      void handler().then(() => {
        res.emit('finish');
        resolve();
      });
    });
  });
}

describe('request timing', () => {
  let info: jest.SpyInstance;

  beforeEach(() => {
    info = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    info.mockRestore();
  });

  it('logs timed steps under the route template once the response finishes', async () => {
    await runRequest(async () => {
      await timeStep('first', async () => undefined);
      await timeStep('second', async () => undefined);
    });

    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0][1]).toMatchObject({
      route: 'GET /api/player/:steamId/info',
      status: 200,
      steps: [
        { name: 'first', ms: expect.any(Number) },
        { name: 'second', ms: expect.any(Number) },
      ],
    });
  });

  it('skips the log for untimed requests and still runs steps outside a request', async () => {
    await runRequest(async () => undefined);
    await expect(timeStep('outside', async () => 42)).resolves.toBe(42);

    expect(info).not.toHaveBeenCalled();
  });
});
