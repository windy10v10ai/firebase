import { MemberLevel } from '../members/entities/members.entity';

import { StripeProductCode } from './enums/stripe-product-code.enum';

export type StripeReward =
  { kind: 'member'; level: MemberLevel } | { kind: 'points'; points: number };

export interface StripeProductSpec {
  /** 收银台上显示的单份商品名，份数由 Stripe 按 quantity 显示 */
  name: string;
  priceCentPerUnit: number;
  reward: StripeReward;
}

export const STRIPE_CURRENCY = 'usd';

// 会员单价与网站标价 US$4/月 一致；会员的一份就是一个月
export const STRIPE_PRODUCT_TABLE: Record<StripeProductCode, StripeProductSpec> = {
  [StripeProductCode.MEMBER_PREMIUM]: {
    name: '10v10AI Premium Membership (1 month)',
    priceCentPerUnit: 400,
    reward: { kind: 'member', level: MemberLevel.PREMIUM },
  },
};
