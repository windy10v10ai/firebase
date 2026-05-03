import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { logger } from 'firebase-functions/v2';

import { Public } from '../util/auth/public.decorator';

import { AlipayService } from './alipay.service';
import { CreateAlipayOrderResponseDto } from './dto/create-alipay-order-response.dto';
import { CreateAlipayOrderDto } from './dto/create-alipay-order.dto';

@ApiTags('Alipay')
@Controller('alipay')
export class AlipayController {
  constructor(private readonly alipayService: AlipayService) {}

  @Post('/order/create')
  async createOrder(@Body() dto: CreateAlipayOrderDto): Promise<CreateAlipayOrderResponseDto> {
    logger.info('Alipay create order', { steamId: dto.steamId, productCode: dto.productCode });
    return this.alipayService.createOrder(dto);
  }

  @Public()
  @Post('/webhook')
  async webhook() {
    // Step 4 实现
  }
}
