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
      .setDescription(
        `
- **Swagger UI**: [http://localhost:3001/api-doc](http://localhost:3001/api-doc)
- **OpenAPI JSON Schema**: [http://localhost:3001/api-docs-json](http://localhost:3001/api-docs-json)

在 Swagger UI 中点击 "Authorize" 按钮，输入测试用的 API Key: \`apikey\`
      `,
      )
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

    // 添加 JSON 格式的 API 文档端点
    app.use('/api-docs-json', (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(document, null, 2));
    });
  }
  await app.listen(3001);
}

bootstrap();
