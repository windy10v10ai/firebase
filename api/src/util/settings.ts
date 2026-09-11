import { ClassSerializerInterceptor, INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

// 只放行自家网站的来源。游戏客户端的请求不带 Origin，cors 中间件原样放过，不受影响
const CORS_ORIGIN_WHITELIST = [
  'https://windy10v10ai.com',
  'https://prod--windy10v10ai.asia-east1.hosted.app',
  'https://dev--windy10v10ai.asia-east1.hosted.app',
  'http://localhost:3000',
];
// 预检结果缓存一天，带 Authorization 或 JSON body 的接口只在首次多一次函数调用
const CORS_PREFLIGHT_MAX_AGE_SECONDS = 86400;

export function AppGlobalSettings(app: INestApplication) {
  app.enableCors({
    origin: CORS_ORIGIN_WHITELIST,
    allowedHeaders: ['Authorization', 'Content-Type'],
    maxAge: CORS_PREFLIGHT_MAX_AGE_SECONDS,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      forbidUnknownValues: false,
    }),
  );
  app.setGlobalPrefix('api');
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
}
