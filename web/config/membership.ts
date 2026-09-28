/**
 * 会员页的平台、价格与外链。价格与 API 的 alipay.constants.ts、game 仓库的会员页常量手动保持一致，
 * 原价取爱发电价：游戏里的折扣就是按它算的。
 */

export type PaymentPlatform = 'alipay' | 'afdian' | 'kofi';

export const PAYMENT_PLATFORMS: PaymentPlatform[] = ['alipay', 'afdian', 'kofi'];

// 默认选中各语言玩家最可能用的那家，标签顺序本身不随语言变
export const DEFAULT_PLATFORM_BY_LOCALE: Record<string, PaymentPlatform> = {
  zh: 'alipay',
  en: 'kofi',
  ru: 'afdian',
};

/** 与 API 的 AlipayProductCode 一致 */
export type AlipayProductCode = 'MEMBER_PREMIUM' | 'POINTS_TIER1' | 'POINTS_TIER2' | 'POINTS_TIER3';

export interface MemberTier {
  months: number;
  pricePerMonth: string;
  total: string;
  discountPercent: number;
}

export const ALIPAY_MEMBER_TIERS: MemberTier[] = [
  { months: 1, pricePerMonth: '28.00', total: '28.00', discountPercent: 6 },
  { months: 3, pricePerMonth: '26.80', total: '80.40', discountPercent: 10 },
  { months: 12, pricePerMonth: '25.00', total: '300.00', discountPercent: 16 },
  { months: 36, pricePerMonth: '23.80', total: '856.80', discountPercent: 20 },
];

export const AFDIAN_MEMBER_PRICE = '29.80';
export const KOFI_MEMBER_PRICE = '4.00';

export interface PointsTier {
  points: number;
  image: string;
  alipayProductCode: AlipayProductCode;
  alipayPrice: string;
  afdianPrice: string;
  kofiPrice: string;
  kofiUrl: string;
  afdianBaseUrl: string;
}

export const POINTS_TIERS: PointsTier[] = [
  {
    points: 4000,
    image: '/images/member/points-1.png',
    alipayProductCode: 'POINTS_TIER1',
    alipayPrice: '78.00',
    afdianPrice: '98.00',
    kofiPrice: '11.99',
    kofiUrl: 'https://ko-fi.com/s/74a1b5be84',
    afdianBaseUrl:
      'https://ifdian.net/order/create?product_type=1&plan_id=6f73a48e546011eda08052540025c377&sku=%5B%7B%22sku_id%22%3A%220c5d8f6c682511ed9b3852540025c377%22%2C%22count%22%3A1%7D%5D&viokrz_ex=0&fr=afcom',
  },
  {
    points: 12500,
    image: '/images/member/points-2.png',
    alipayProductCode: 'POINTS_TIER2',
    alipayPrice: '238.00',
    afdianPrice: '280.00',
    kofiPrice: '36.99',
    kofiUrl: 'https://ko-fi.com/s/0e9591aa5d',
    afdianBaseUrl:
      'https://ifdian.net/order/create?product_type=1&plan_id=29df1632688911ed9e7052540025c377&sku=%5B%7B%22sku_id%22%3A%2229e33974688911ed815d52540025c377%22%2C%22count%22%3A1%7D%5D&viokrz_ex=0&fr=afcom',
  },
  {
    points: 31000,
    image: '/images/member/points-3.png',
    alipayProductCode: 'POINTS_TIER3',
    alipayPrice: '568.00',
    afdianPrice: '648.00',
    kofiPrice: '89.99',
    kofiUrl: 'https://ko-fi.com/s/3d4304d9a7',
    afdianBaseUrl:
      'https://ifdian.net/order/create?product_type=1&plan_id=0783fa70688a11edacd452540025c377&sku=%5B%7B%22sku_id%22%3A%22078882b6688a11edb2ca52540025c377%22%2C%22count%22%3A1%7D%5D&viokrz_ex=0&fr=afcom',
  },
];

const AFDIAN_MEMBER_BASE_URL =
  'https://ifdian.net/order/create?plan_id=6c206f360d4c11f0a2cb52540025c377&product_type=0';

export const KOFI_MEMBER_URL = 'https://ko-fi.com/post/Membership-Z8Z01CDJLU';

// 备注带上 ID，爱发电的回调按它自动激活，玩家不用自己填；未登录时不带，玩家在留言里自己填
function withRemark(url: string, steamId: string | null) {
  return steamId ? `${url}&remark=${steamId}` : url;
}

export function afdianMemberUrl(steamId: string | null) {
  return withRemark(AFDIAN_MEMBER_BASE_URL, steamId);
}

export function afdianPointsUrl(tier: PointsTier, steamId: string | null) {
  return withRemark(tier.afdianBaseUrl, steamId);
}

export const PLATFORM_ICONS: Record<PaymentPlatform, string> = {
  alipay: '/images/member/alipay.png',
  afdian: '/images/member/afdian.png',
  kofi: '/images/member/kofi.png',
};

// 与游戏里支付宝面板的查单间隔一致
export const ALIPAY_POLL_INTERVAL_MS = 2000;
