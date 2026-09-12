import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { Request } from 'express';

export interface ClientOrigin {
  ip?: string;
  country?: string;
}

// 只有玩家直连 API 域名时这两个头才是真实来源；经网站域名转发进来的请求，
// 边缘看到的是转发服务器自己的地址
export const CurrentClientOrigin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ClientOrigin => {
    const headers = ctx.switchToHttp().getRequest<Request>().headers;
    return {
      ip: headers['cf-connecting-ip'] as string | undefined,
      country: headers['cf-ipcountry'] as string | undefined,
    };
  },
);
