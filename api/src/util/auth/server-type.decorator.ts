import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { Request } from 'express';

import { SERVER_TYPE } from '../secret/secret.service';

export interface RequestWithServerType extends Request {
  serverType: SERVER_TYPE;
  /** 网站来源带了有效 ID Token 时的 uid；未登录的访客没有 */
  viewerUid?: string;
}

export const CurrentServerType = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SERVER_TYPE =>
    ctx.switchToHttp().getRequest<RequestWithServerType>().serverType,
);

/** 调用方能否看到 `:steamId` 玩家的私密字段：游戏服务器与本人可以，网站访客不行 */
export const CanViewPrivate = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<RequestWithServerType>();
  return request.serverType !== SERVER_TYPE.WEB || request.viewerUid === request.params.steamId;
});

export const CurrentViewerUid = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined =>
    ctx.switchToHttp().getRequest<RequestWithServerType>().viewerUid,
);
