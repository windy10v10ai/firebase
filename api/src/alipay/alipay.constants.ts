import { MemberLevel } from '../members/entities/members.entity';

import { AlipayProductCode } from './enums/alipay-product-code.enum';

export type AlipayReward =
  | { kind: 'member'; level: MemberLevel }
  | { kind: 'points'; points: number };

export interface AlipayProductSpec {
  /** 用于构建订单标题，quantity > 1 时 service 自动追加数量 */
  subjectUnit: string;
  /** 单份价格（分） */
  priceCentPerUnit: number;
  reward: AlipayReward;
}

export interface MemberDiscountTier {
  /** 达到此月数起适用本档 */
  minMonths: number;
  /** 每月实际价格（分） */
  priceCentPerMonth: number;
  /** 相对原价 ¥29.80 的折扣百分比，如 6 表示 6% off */
  discountPercent: number;
}

/** 从大到小排列，calculatePrice 取第一个满足 minMonths <= quantity 的档 */
export const MEMBER_DISCOUNT_TIERS: MemberDiscountTier[] = [
  { minMonths: 36, priceCentPerMonth: 2380, discountPercent: 20 },
  { minMonths: 12, priceCentPerMonth: 2500, discountPercent: 16 },
  { minMonths: 3, priceCentPerMonth: 2680, discountPercent: 10 },
  { minMonths: 1, priceCentPerMonth: 2800, discountPercent: 6 },
];

export const ALIPAY_PRODUCT_TABLE: Record<AlipayProductCode, AlipayProductSpec> = {
  [AlipayProductCode.MEMBER_PREMIUM]: {
    subjectUnit: '10v10AI 高级会员',
    priceCentPerUnit: 2800,
    reward: { kind: 'member', level: MemberLevel.PREMIUM },
  },
  [AlipayProductCode.POINTS_TIER1]: {
    subjectUnit: '10v10AI 会员积分 3500',
    priceCentPerUnit: 7800,
    reward: { kind: 'points', points: 3500 },
  },
  [AlipayProductCode.POINTS_TIER2]: {
    subjectUnit: '10v10AI 会员积分 11000',
    priceCentPerUnit: 23800,
    reward: { kind: 'points', points: 11000 },
  },
  [AlipayProductCode.POINTS_TIER3]: {
    subjectUnit: '10v10AI 会员积分 28000',
    priceCentPerUnit: 56800,
    reward: { kind: 'points', points: 28000 },
  },
};

// 支付宝 precreate 二维码硬限制 2 小时
export const ALIPAY_QR_EXPIRE_MS = 2 * 60 * 60 * 1000;
