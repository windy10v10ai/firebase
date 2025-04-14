import * as fs from 'fs';

import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { dump } from 'js-yaml';

import { AppModule } from './app.module';
import { AppGlobalSettings } from './util/settings';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  AppGlobalSettings(app);

  // 允许来自web画面的跨域名访问
  // 根据环境设置 CORS origin
  const isLocal = process.env.ENVIRONMENT === 'local';
  const allowedOrigins = isLocal
    ? true // 本地环境允许所有来源
    : ['https://www.windy10v10ai.com']; // 生产环境只允许特定域名

  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'Authorization', 'x-api-key'],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  if (process.env.ENVIRONMENT == 'local') {
    const config = new DocumentBuilder()
      .setTitle('Windy10v10 Cloud API')
      .setVersion('1.0')
      .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'x-api-key')
      .addSecurityRequirements('x-api-key')
      .build();
    const document = SwaggerModule.createDocument(app, config);

    fs.writeFileSync('./swagger-spec.yaml', dump(document, {}));
    SwaggerModule.setup('api-doc', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });
  }
  await app.listen(3001);
}

bootstrap();
