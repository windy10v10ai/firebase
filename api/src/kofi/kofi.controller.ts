import { Body, Controller, Post, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Public } from '../util/auth/public.decorator';
import { SECRET, SecretService } from '../util/secret/secret.service';

import { KofiWebhookDto } from './dto/kofi-webhook.dto';
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
  async handleWebhook(@Body() webhookData: KofiWebhookDto) {
    const verificationToken = this.secretService.getSecretValue(SECRET.KOFI_VERIFICATION_TOKEN);

    if (webhookData.verification_token !== verificationToken) {
      throw new UnauthorizedException('Invalid verification token');
    }

    return this.kofiService.handleWebhook(webhookData);
  }
}
