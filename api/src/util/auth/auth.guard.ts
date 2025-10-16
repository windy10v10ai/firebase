import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

import { SECRET, SecretService } from '../secret/secret.service';

import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private sercretService: SecretService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = request.headers['x-api-key'];

    const serverApiKey = this.sercretService.getSecretValue(SECRET.SERVER_APIKEY);
    const testServerApiKey = this.sercretService.getSecretValue(SECRET.SERVER_APIKEY_TEST);
    const tenvtenServerApiKey = this.sercretService.getSecretValue(SECRET.SERVER_APIKEY_TENVTEN);

    if (apiKey === serverApiKey || apiKey === testServerApiKey || apiKey === tenvtenServerApiKey) {
      return true;
    }

    throw new UnauthorizedException();
  }
}
