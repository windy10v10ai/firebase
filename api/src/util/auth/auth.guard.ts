import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { SERVER_TYPE, SecretService } from '../secret/secret.service';

import { ALLOW_LOCAL_KEY } from './allow-local.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';
import { RequestWithServerType } from './server-type.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private secretService: SecretService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithServerType>();
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
}
