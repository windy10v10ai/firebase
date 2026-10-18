import { Controller, Get, Headers, Param, Post, RawBodyRequest, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';

import { AllowWeb } from '../util/auth/allow-web.decorator';
import { Public } from '../util/auth/public.decorator';
import { CurrentViewerUid } from '../util/auth/server-type.decorator';

import { CreateStripeOrderResponseDto } from './dto/create-stripe-order-response.dto';
import { QueryStripeOrderResponseDto } from './dto/query-stripe-order-response.dto';
import { StripeService } from './stripe.service';

@ApiTags('Stripe')
@Controller('stripe')
export class StripeController {
  constructor(private readonly stripeService: StripeService) {}

  @AllowWeb()
  @Post('/order')
  async createOrder(
    @CurrentViewerUid() viewerUid: string | undefined,
  ): Promise<CreateStripeOrderResponseDto> {
    return this.stripeService.createOrder(viewerUid);
  }

  @AllowWeb()
  @Get('/order/:orderId')
  async queryOrder(
    @Param('orderId') orderId: string,
    @CurrentViewerUid() viewerUid: string | undefined,
  ): Promise<QueryStripeOrderResponseDto> {
    return this.stripeService.getOrderStatus(orderId, viewerUid);
  }

  /** 验签要用未经解析的原始请求体 */
  @Public()
  @Post('/webhook')
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ): Promise<{ received: true }> {
    await this.stripeService.handleWebhook(req.rawBody, signature);
    return { received: true };
  }
}
