import * as fs from 'fs';

import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { dump } from 'js-yaml';

import { AppModule } from './app.module';
import { AppGlobalSettings } from './util/settings';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  AppGlobalSettings(app);

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
