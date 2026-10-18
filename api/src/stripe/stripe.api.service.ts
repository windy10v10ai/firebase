import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { logger } from 'firebase-functions/v2';
import Stripe from 'stripe';

import { SECRET, SecretService } from '../util/secret/secret.service';

export interface CheckoutSessionParams {
  orderId: string;
  steamId: number;
  unitAmountCent: number;
  quantity: number;
  currency: string;
  productName: string;
  productDescription: string;
  productImageUrl: string;
  submitMessage: string;
  locale: Stripe.Checkout.SessionCreateParams.Locale;
  successUrl: string;
  cancelUrl: string;
}

@Injectable()
export class StripeApiService {
  private client?: Stripe;

  constructor(private readonly secretService: SecretService) {}

  private getClient(): Stripe {
    this.client ??= new Stripe(this.secretService.getSecretValue(SECRET.STRIPE_SECRET_KEY));
    return this.client;
  }

  async createCheckoutSession(params: CheckoutSessionParams): Promise<{ id: string; url: string }> {
    const session = await this.getClient().checkout.sessions.create(
      {
        mode: 'payment',
        // card 已包含 Apple Pay / Google Pay；只收付款当场就能确定结果的方式
        allowed_payment_method_types: ['card', 'link'],
        line_items: [
          {
            quantity: params.quantity,
            price_data: {
              currency: params.currency,
              unit_amount: params.unitAmountCent,
              product_data: {
                name: params.productName,
                description: params.productDescription,
                images: [params.productImageUrl],
              },
            },
          },
        ],
        client_reference_id: params.orderId,
        metadata: { orderId: params.orderId, steamId: String(params.steamId) },
        payment_intent_data: { metadata: { orderId: params.orderId } },
        locale: params.locale,
        custom_text: { submit: { message: params.submitMessage } },
        // 外观随代码走，测试与正式账号不用各在后台配一遍
        branding_settings: {
          display_name: 'Windy10v10AI',
          background_color: '#0f0f11',
          button_color: '#2563eb',
          border_style: 'rounded',
        },
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
      },
      // 同一订单的网络重试不会生成第二个收银台
      { idempotencyKey: params.orderId },
    );
    if (!session.url) {
      logger.error('[Stripe] Checkout session 没有返回 url', { orderId: params.orderId });
      throw new InternalServerErrorException('stripe checkout session has no url');
    }
    return { id: session.id, url: session.url };
  }

  /** 验签并解析回调；签名不对时抛异常。 */
  constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
    return this.getClient().webhooks.constructEvent(
      rawBody,
      signature,
      this.secretService.getSecretValue(SECRET.STRIPE_WEBHOOK_SECRET),
    );
  }
}
