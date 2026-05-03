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

export const ALIPAY_PRODUCT_TABLE: Record<AlipayProductCode, AlipayProductSpec> = {
  [AlipayProductCode.MEMBER_PREMIUM]: {
    subjectUnit: '高级会员',
    priceCentPerUnit: 2800,
    reward: { kind: 'member', level: MemberLevel.PREMIUM },
  },
  [AlipayProductCode.POINTS_TIER1]: {
    subjectUnit: '会员积分',
    priceCentPerUnit: 7800,
    reward: { kind: 'points', points: 3500 },
  },
  [AlipayProductCode.POINTS_TIER2]: {
    subjectUnit: '会员积分',
    priceCentPerUnit: 23800,
    reward: { kind: 'points', points: 11000 },
  },
  [AlipayProductCode.POINTS_TIER3]: {
    subjectUnit: '会员积分',
    priceCentPerUnit: 56800,
    reward: { kind: 'points', points: 28000 },
  },
};

// 支付宝 precreate 二维码硬限制 2 小时
export const ALIPAY_QR_EXPIRE_MS = 2 * 60 * 60 * 1000;
