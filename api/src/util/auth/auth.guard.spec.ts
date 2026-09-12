import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { getAuth } from 'firebase-admin/auth';

import { SERVER_TYPE } from '../secret/secret.service';

import { ALLOW_LOCAL_KEY } from './allow-local.decorator';
import { ALLOW_WEB_KEY } from './allow-web.decorator';
import { AuthGuard } from './auth.guard';
import { IS_PUBLIC_KEY } from './public.decorator';
import { RequestWithServerType } from './server-type.decorator';

jest.mock('firebase-admin/auth');

function createContext(options: { apiKey?: string; bearerToken?: string; steamId?: string } = {}) {
  const headers: Record<string, string> = {};
  if (options.apiKey) headers['x-api-key'] = options.apiKey;
  if (options.bearerToken) headers.authorization = `Bearer ${options.bearerToken}`;
  const request = {
    headers,
    params: options.steamId === undefined ? {} : { steamId: options.steamId },
  } as unknown as RequestWithServerType;
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
  return { context, request };
}

function createGuard(metadata: Record<string, boolean> = {}) {
  const reflector = {
    getAllAndOverride: jest.fn((key: string) => metadata[key]),
  } as unknown as Reflector;
  const secretService = {
    getServerTypeByApiKey: jest.fn((apiKey: string) => {
      if (apiKey === 'windy-key') return SERVER_TYPE.WINDY;
      if (apiKey === 'local-key') return SERVER_TYPE.LOCAL;
      return SERVER_TYPE.UNKNOWN;
    }),
  };
  return new AuthGuard(reflector, secretService as never);
}

describe('AuthGuard', () => {
  it('官方 key 放行，并把来源写进 request', async () => {
    const guard = createGuard();
    const { context, request } = createContext({ apiKey: 'windy-key' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.serverType).toBe(SERVER_TYPE.WINDY);
  });

  it('未知 key 抛 401', async () => {
    const guard = createGuard();
    const { context } = createContext({ apiKey: 'nope' });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('本地 key 未挂 AllowLocal 抛 401', async () => {
    const guard = createGuard();
    const { context } = createContext({ apiKey: 'local-key' });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('本地 key 挂了 AllowLocal 放行', async () => {
    const guard = createGuard({ [ALLOW_LOCAL_KEY]: true });
    const { context, request } = createContext({ apiKey: 'local-key' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.serverType).toBe(SERVER_TYPE.LOCAL);
  });

  it('Public 路由直接放行，不解析来源', async () => {
    const guard = createGuard({ [IS_PUBLIC_KEY]: true });
    const { context, request } = createContext();

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.serverType).toBeUndefined();
  });

  describe('网站来源（Bearer ID Token）', () => {
    const verifyIdToken = getAuth as jest.MockedFunction<typeof getAuth>;

    function mockVerify(result: { uid: string } | Error) {
      verifyIdToken.mockReturnValue({
        verifyIdToken:
          result instanceof Error
            ? jest.fn().mockRejectedValue(result)
            : jest.fn().mockResolvedValue(result),
      } as never);
    }

    it('token 有效且路由未带 steamId，挂 AllowWeb 放行', async () => {
      mockVerify({ uid: '136407523' });
      const guard = createGuard({ [ALLOW_WEB_KEY]: true });
      const { context, request } = createContext({ bearerToken: 'valid-token' });

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(request.serverType).toBe(SERVER_TYPE.WEB);
    });

    it('token 里的 uid 与路由 steamId 一致，放行', async () => {
      mockVerify({ uid: '136407523' });
      const guard = createGuard({ [ALLOW_WEB_KEY]: true });
      const { context } = createContext({ bearerToken: 'valid-token', steamId: '136407523' });

      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('token 里的 uid 与路由 steamId 不一致，抛 401', async () => {
      mockVerify({ uid: '136407523' });
      const guard = createGuard({ [ALLOW_WEB_KEY]: true });
      const { context } = createContext({ bearerToken: 'valid-token', steamId: '999999999' });

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });

    it('未挂 AllowWeb 的路由拒绝网站来源', async () => {
      mockVerify({ uid: '136407523' });
      const guard = createGuard();
      const { context } = createContext({ bearerToken: 'valid-token' });

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });

    it('token 过期或伪造，抛 401', async () => {
      mockVerify(new Error('invalid token'));
      const guard = createGuard({ [ALLOW_WEB_KEY]: true });
      const { context } = createContext({ bearerToken: 'bad-token' });

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });
  });
});
