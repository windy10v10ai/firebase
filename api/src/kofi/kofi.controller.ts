import { BadRequestException, Body, Controller, Post, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { logger } from 'firebase-functions/v2';

import { Public } from '../util/auth/public.decorator';
import { SECRET, SecretService } from '../util/secret/secret.service';

import { KofiWebhookDto } from './dto/kofi-webhook.dto';
import { ActiveKofiOrderDto } from './dto/active-kofi-order.dto';
import { KofiService } from './kofi.service';

@Public()
@ApiTags('Kofi(Public)')
@Controller('kofi')
export class KofiController {
  constructor(
    private readonly kofiService: KofiService,
    private readonly secretService: SecretService,
  ) {}

  @Post('webhook')
  async handleWebhook(@Body('data') data: string) {
    if (!data) {
      throw new BadRequestException('Missing data field');
    }

    let webhookData: KofiWebhookDto;
    try {
      webhookData = JSON.parse(data);
    } catch {
      throw new BadRequestException('Invalid JSON format');
    }

    // 验证必要字段
    if (!webhookData.message_id) {
      throw new BadRequestException('Missing required field: message_id');
    }

    const verificationToken = this.secretService.getSecretValue(SECRET.KOFI_VERIFICATION_TOKEN);

    if (webhookData.verification_token !== verificationToken) {
      logger.warn('Kofi webhook invalid verification token');
      throw new UnauthorizedException('Invalid verification token');
    }

    return this.kofiService.handleWebhook(webhookData);
  }

  @Post('/order/active')
  async activeOrder(@Body() dto: ActiveKofiOrderDto) {
    logger.info('Kofi order active', { dto });
    const result = await this.kofiService.activeOrderManual(dto);
    if (!result) {
      logger.warn('Kofi order active failed', { dto });
    }
    return { result: true };
  }
}
