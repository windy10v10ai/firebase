import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { logger } from 'firebase-functions';

import { Public } from '../util/auth/public.decorator';
import { SECRET, SecretService } from '../util/secret/secret.service';

import { AfdianService } from './afdian.service';
import { ActiveAfdianOrderDto } from './dto/active-afdian-order.dto';
import { AfdianWebhookDto } from './dto/afdian-webhook.dto';

@Public()
@ApiTags('Afdian(Public)')
@Controller('afdian')
export class AfdianController {
  constructor(
    private readonly afdianService: AfdianService,
    private readonly secretService: SecretService,
  ) {}

  @Post('/webhook')
  async processAfdianWebhook(
    @Body() afdianWebhookDto: AfdianWebhookDto,
    @Query('token') token: string,
  ) {
    if (token !== this.secretService.getSecretValue(SECRET.AFDIAN_WEBHOOK_TOKEN)) {
      logger.warn(`接收到不可用的爱发电Token`);
      throw new UnauthorizedException();
    }
    const order = afdianWebhookDto?.data?.order;
    if (!order) {
      throw new BadRequestException();
    }
    const result = await this.afdianService.activeWebhookOrder(order);
    if (result) {
      return { ec: 200, em: 'ok' };
    } else {
      return { ec: 200, em: '[Error] 未能正确获取Dota2 ID' };
    }
  }

  @Post('/order/active')
  async activeOrder(@Body() dto: ActiveAfdianOrderDto) {
    logger.info('开始处理爱发电手动激活订单', { outTradeNo: dto.outTradeNo, steamId: dto.steamId });
    const result = await this.afdianService.activeOrderManual(dto.outTradeNo, dto.steamId);
    if (!result) {
      logger.warn('爱发电手动激活订单失败', { outTradeNo: dto.outTradeNo, steamId: dto.steamId });
    } else {
      logger.info('爱发电手动激活订单成功', { outTradeNo: dto.outTradeNo, steamId: dto.steamId });
    }
    return { result };
  }
}
