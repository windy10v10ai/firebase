import { Controller, Get, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { logger } from 'firebase-functions';

import { AppService } from './app.service';
import { Public } from './util/auth/public.decorator';

@Public()
@ApiTags('Hello World')
@Controller('hello')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(@Req() request: Request): string {
    // 用来确认 Cloudflare 与 Hosting 把哪些来源信息透传到了函数，两条链路的结果并不相同
    logger.info('[hello] forwarded headers', {
      cfConnectingIp: request.headers['cf-connecting-ip'],
      cfIpCountry: request.headers['cf-ipcountry'],
      xForwardedFor: request.headers['x-forwarded-for'],
      userAgent: request.headers['user-agent'],
    });
    return this.appService.getHello();
  }
}
