import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import * as functions from 'firebase-functions';

import { AppService } from './app.service';
import { Public } from './util/auth/public.decorator';

@Public()
@ApiTags('Hello World')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('env')
  getEnv(): string {
    const test_env = functions.config().admin?.test_env;
    return `test_env: ${test_env}`;
  }
}
