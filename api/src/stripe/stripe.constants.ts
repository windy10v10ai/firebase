import { MemberLevel } from '../members/entities/members.entity';

// 与网站标价 US$4/月 一致
export const STRIPE_MEMBER_PRICE_CENT = 400;
export const STRIPE_CURRENCY = 'usd';
export const STRIPE_MEMBER_LEVEL = MemberLevel.PREMIUM;
export const STRIPE_MEMBER_MONTH = 1;
export const STRIPE_PRODUCT_NAME = '10v10AI Premium Membership (1 month)';
export const STRIPE_ANALYTICS_ITEM_ID = 'MEMBER_PREMIUM';
