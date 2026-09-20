import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { Request } from 'express';

import { SERVER_TYPE } from '../secret/secret.service';

export interface RequestWithServerType extends Request {
  serverType: SERVER_TYPE;
}

export const CurrentServerType = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SERVER_TYPE =>
    ctx.switchToHttp().getRequest<RequestWithServerType>().serverType,
);
