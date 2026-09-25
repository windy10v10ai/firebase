import { ClassSerializerInterceptor, INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ValidationError } from 'class-validator';
import { logger } from 'firebase-functions';

// 网站页面可能出现的来源。既是 CORS 白名单，也是 Steam 回调地址的白名单——能调 API 的
// 站点和能承载登录页的站点是同一批。游戏客户端的请求不带 Origin，cors 中间件原样放过
export const SITE_ORIGIN_WHITELIST = [
  'https://windy10v10ai.com',
  'https://prod--windy10v10ai.asia-east1.hosted.app',
  'https://dev--windy10v10ai.asia-east1.hosted.app',
  'http://localhost:3000',
];
// 预检结果缓存一天，带 Authorization 或 JSON body 的接口只在首次多一次函数调用
const CORS_PREFLIGHT_MAX_AGE_SECONDS = 86400;

function collectInvalidFields(errors: ValidationError[], prefix = ''): string[] {
  return errors.flatMap((error) => {
    const path = `${prefix}${error.property}`;
    const own = error.constraints ? [path] : [];
    return [...own, ...collectInvalidFields(error.children ?? [], `${path}.`)];
  });
}

// 游戏服务器只知道请求失败，看不到原因；不在后端记一笔，报文哪个字段不合格就无从查起
class LoggedValidationPipe extends ValidationPipe {
  createExceptionFactory() {
    const createException = super.createExceptionFactory();
    return (errors: ValidationError[]) => {
      const target = errors[0]?.target as { version?: unknown; players?: unknown } | undefined;
      const steamIds = Array.isArray(target?.players)
        ? target.players.map((player) => player?.steamId).filter((steamId) => steamId > 0)
        : undefined;
      logger.warn('request validation failed', {
        fields: collectInvalidFields(errors),
        version: target?.version,
        steamIds,
      });
      return createException(errors);
    };
  }
}

export function AppGlobalSettings(app: INestApplication) {
  app.enableCors({
    origin: SITE_ORIGIN_WHITELIST,
    allowedHeaders: ['Authorization', 'Content-Type'],
    maxAge: CORS_PREFLIGHT_MAX_AGE_SECONDS,
  });
  app.useGlobalPipes(
    new LoggedValidationPipe({
      transform: true,
      forbidUnknownValues: false,
    }),
  );
  app.setGlobalPrefix('api');
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
}
