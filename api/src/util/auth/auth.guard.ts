import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { getAuth } from 'firebase-admin/auth';

import { SERVER_TYPE, SecretService } from '../secret/secret.service';

import { ALLOW_LOCAL_KEY } from './allow-local.decorator';
import { ALLOW_WEB_KEY } from './allow-web.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';
import { RequestWithServerType } from './server-type.decorator';

const BEARER_PREFIX = 'Bearer ';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private secretService: SecretService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithServerType>();

    const authorization = request.headers.authorization;
    if (authorization?.startsWith(BEARER_PREFIX)) {
      return this.authenticateWeb(context, request, authorization.slice(BEARER_PREFIX.length));
    }

    const apiKey = request.headers['x-api-key'] as string;
    const serverType = this.secretService.getServerTypeByApiKey(apiKey);
    request.serverType = serverType;

    if (serverType === SERVER_TYPE.UNKNOWN) {
      throw new UnauthorizedException();
    }

    // 本地主机的 key 打包在地图里、随时可能泄露，默认不放行；只有显式声明
    // 接受本地来源的路由才通过
    if (serverType === SERVER_TYPE.LOCAL) {
      const allowLocal = this.reflector.getAllAndOverride<boolean>(ALLOW_LOCAL_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (!allowLocal) {
        throw new UnauthorizedException();
      }
    }

    return true;
  }

  private async authenticateWeb(
    context: ExecutionContext,
    request: RequestWithServerType,
    idToken: string,
  ): Promise<boolean> {
    const allowWeb = this.reflector.getAllAndOverride<boolean>(ALLOW_WEB_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!allowWeb) {
      throw new UnauthorizedException();
    }

    let uid: string;
    try {
      uid = (await getAuth().verifyIdToken(idToken)).uid;
    } catch {
      throw new UnauthorizedException();
    }
    request.serverType = SERVER_TYPE.WEB;

    // uid 就是 32 位账号 ID，与路由里的 :steamId 一致才算操作自己的账号。
    // 身份本身有效，只是无权访问这个账号，所以是 403 不是 401——网站靠这个区分
    // 「需要登录」和「这个人的资料看不了」
    const routeSteamId = request.params.steamId;
    if (routeSteamId !== undefined && routeSteamId !== uid) {
      throw new ForbiddenException();
    }

    return true;
  }
}
