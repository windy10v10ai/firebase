import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { SERVER_TYPE } from '../secret/secret.service';

import { ALLOW_LOCAL_KEY } from './allow-local.decorator';
import { AuthGuard } from './auth.guard';
import { IS_PUBLIC_KEY } from './public.decorator';
import { RequestWithServerType } from './server-type.decorator';

function createContext(apiKey?: string) {
  const request = { headers: apiKey ? { 'x-api-key': apiKey } : {} } as RequestWithServerType;
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
  it('官方 key 放行，并把来源写进 request', () => {
    const guard = createGuard();
    const { context, request } = createContext('windy-key');

    expect(guard.canActivate(context)).toBe(true);
    expect(request.serverType).toBe(SERVER_TYPE.WINDY);
  });

  it('未知 key 抛 401', () => {
    const guard = createGuard();
    const { context } = createContext('nope');

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('本地 key 未挂 AllowLocal 抛 401', () => {
    const guard = createGuard();
    const { context } = createContext('local-key');

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('本地 key 挂了 AllowLocal 放行', () => {
    const guard = createGuard({ [ALLOW_LOCAL_KEY]: true });
    const { context, request } = createContext('local-key');

    expect(guard.canActivate(context)).toBe(true);
    expect(request.serverType).toBe(SERVER_TYPE.LOCAL);
  });

  it('Public 路由直接放行，不解析来源', () => {
    const guard = createGuard({ [IS_PUBLIC_KEY]: true });
    const { context, request } = createContext();

    expect(guard.canActivate(context)).toBe(true);
    expect(request.serverType).toBeUndefined();
  });
});
