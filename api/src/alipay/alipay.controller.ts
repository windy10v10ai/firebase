import { Body, Controller, Get, Header, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { logger } from 'firebase-functions/v2';

import { Public } from '../util/auth/public.decorator';

import { AlipayService } from './alipay.service';
import { AlipayNotifyDto } from './dto/alipay-notify.dto';
import { CreateAlipayOrderResponseDto } from './dto/create-alipay-order-response.dto';
import { CreateAlipayOrderDto } from './dto/create-alipay-order.dto';
import { QueryAlipayOrderResponseDto } from './dto/query-alipay-order-response.dto';
import { QueryAlipayOrderDto } from './dto/query-alipay-order.dto';

@ApiTags('Alipay')
@Controller('alipay')
export class AlipayController {
  constructor(private readonly alipayService: AlipayService) {}

  @Post('/order/create')
  async createOrder(@Body() dto: CreateAlipayOrderDto): Promise<CreateAlipayOrderResponseDto> {
    logger.info('Alipay create order', { steamId: dto.steamId, productCode: dto.productCode });
    return this.alipayService.createOrder(dto);
  }

  @Get('/order/query')
  async queryOrder(@Query() dto: QueryAlipayOrderDto): Promise<QueryAlipayOrderResponseDto> {
    return this.alipayService.getOrderStatus(dto.outTradeNo);
  }

  /**
   * 支付宝异步通知端点，application/x-www-form-urlencoded。
   *
   * Firebase Cloud Functions 已将 form-urlencoded body 自动解析为 req.body 对象，
   * 所以这里直接 @Body() 拿到字段集合即可，无需额外挂 express.urlencoded 中间件。
   *
   * 必须按支付宝规范回纯文本 'success' / 'failure'，不能带 JSON 包装。
   */
  @Public()
  @Post('/webhook')
  @Header('Content-Type', 'text/plain')
  async webhook(@Body() body: AlipayNotifyDto): Promise<string> {
    logger.info('Alipay webhook received', {
      outTradeNo: body?.out_trade_no,
      tradeStatus: body?.trade_status,
      alipayTradeNo: body?.trade_no,
    });
    return this.alipayService.handleWebhook(body);
  }
}
