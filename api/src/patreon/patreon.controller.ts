import * as crypto from 'crypto';

import { Body, Controller, ForbiddenException, Get, Headers, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { logger } from 'firebase-functions';

import { PatreonWebhookDto } from './dto/patreon-webhook.dto';
import { PatreonService } from './patreon.service';

@ApiTags('Patreon(Open)')
@Controller('patreon')
export class PatreonController {
  constructor(private readonly patreonService: PatreonService) {}

  @Get()
  async patreon() {
    return 'Hello Patreon!';
  }

  @Post('/webhook')
  async patreonWebhook(
    @Body() patreonWebhookDto: PatreonWebhookDto,
    @Headers('X-Patreon-Event') event: string,
    @Headers('X-Patreon-Signature') signature: string,
  ) {
    // 使用相同的密钥和MD5算法对请求体进行HMAC签名
    const secret = process.env.PATREON_SECRET; // 你的密钥
    const hash = crypto
      .createHmac('md5', secret)
      .update(JSON.stringify(patreonWebhookDto))
      .digest('hex');
    // 如果签名不匹配，返回403
    logger.debug('Patreon webhook called with:', patreonWebhookDto);
    logger.debug('X-Patreon-Event:', event);
    logger.debug('X-Patreon-Signature:', signature);
    logger.debug('Hash:', hash);

    // FIXME: 总是返回403，因为签名不匹配
    if (hash !== signature) {
      throw new ForbiddenException('Invalid signature');
    }
  }
}
