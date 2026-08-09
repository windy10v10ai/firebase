import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { DailyChallengeConfigService } from '../services/daily-challenge-config.service';
import { DailyChallengeConfigSnapshot } from '../types/daily-challenge-config.types';

@ApiTags('Daily Challenge Config')
@Controller('admin/daily-challenge/config')
export class DailyChallengeConfigController {
  constructor(private readonly configService: DailyChallengeConfigService) {}

  @Get('draft')
  getDraft() {
    return this.configService.getDraft();
  }

  @Put('draft')
  saveDraft(
    @Body() config: DailyChallengeConfigSnapshot,
    @Headers('x-admin-actor') actor?: string,
  ) {
    return this.configService.saveDraft(config, this.requireActor(actor));
  }

  @Post('publish')
  publishDraft(@Headers('x-admin-actor') actor?: string) {
    return this.configService.publishDraft(this.requireActor(actor));
  }

  @Get('published')
  getPublished() {
    return this.configService.getPublished();
  }

  @Get('versions')
  listVersions() {
    return this.configService.listVersions();
  }

  @Get('versions/:versionId')
  getVersion(@Param('versionId') versionId: string) {
    return this.configService.getVersion(versionId);
  }

  @Post('versions/:versionId/rollback')
  rollback(@Param('versionId') versionId: string, @Headers('x-admin-actor') actor?: string) {
    return this.configService.rollback(versionId, this.requireActor(actor));
  }

  private requireActor(actor?: string): string {
    const normalizedActor = actor?.trim();
    if (!normalizedActor) {
      throw new BadRequestException('Missing daily challenge config actor');
    }
    return normalizedActor;
  }
}
