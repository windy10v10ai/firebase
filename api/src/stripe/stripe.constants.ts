import { MemberLevel } from '../members/entities/members.entity';

import { StripeProductCode } from './enums/stripe-product-code.enum';

export type StripeReward =
  { kind: 'member'; level: MemberLevel } | { kind: 'points'; points: number };

/** 网站支持的语言，收银台语言与商品文案跟随它 */
export const STRIPE_LOCALES = ['zh', 'en', 'ru'] as const;
export type StripeLocale = (typeof STRIPE_LOCALES)[number];
export const DEFAULT_STRIPE_LOCALE: StripeLocale = 'en';

export interface StripeProductSpec {
  /** 收银台上显示的单份商品名，份数由 Stripe 按 quantity 显示 */
  name: Record<StripeLocale, string>;
  /** 收银台商品名下方的权益列表，每项一行 */
  benefits: Record<StripeLocale, string[]>;
  /** 网站公开目录下的商品图路径 */
  imagePath: string;
  priceCentPerUnit: number;
  reward: StripeReward;
}

export const STRIPE_CURRENCY = 'usd';

// 会员单价与网站标价 US$4/月 一致；会员的一份就是一个月
export const STRIPE_PRODUCT_TABLE: Record<StripeProductCode, StripeProductSpec> = {
  [StripeProductCode.MEMBER_PREMIUM]: {
    name: {
      zh: '高级会员 · 1 个月',
      en: 'Premium Membership · 1 month',
      ru: 'Premium-подписка · 1 месяц',
    },
    benefits: {
      zh: [
        '💎 立即获得 1000 会员积分，每天签到再领 100',
        '🎯 开局技能 8 选 1，高级技能概率更高',
        '🪙 解锁 99999 金钱上限',
        '🎁 藏宝箱物品可刷新一次',
        '⚔️ 专属 BUFF：+10 攻击 +5% 技能增强 +300HP +200MP',
        '🛡️ 复活 -5 秒，买活 CD 2 分钟',
        '🎮 开局主动 / 被动技能各可刷新一次',
      ],
      en: [
        '💎 1000 Member Points now, plus 100 per daily check-in',
        '🎯 Skill draft becomes pick 1 of 8, with better odds for advanced skills',
        '🪙 Unlocks the 99999 gold cap',
        '🎁 One reroll for treasure chest items',
        '⚔️ Exclusive BUFF: +10 attack, +5% spell amp, +300 HP, +200 MP',
        '🛡️ Respawn -5 s, buyback cooldown 2 min',
        '🎮 One reroll each for the starting active and passive skills',
      ],
      ru: [
        '💎 1000 Member Points сразу и ещё 100 за каждую ежедневную отметку',
        '🎯 Выбор способностей 1 из 8, продвинутые выпадают чаще',
        '🪙 Лимит золота 99999',
        '🎁 Одна замена предметов из сундуков с сокровищами',
        '⚔️ Эксклюзивный бафф: +10 к атаке, +5% к усилению заклинаний, +300 здоровья, +200 маны',
        '🛡️ Возрождение на 5 с быстрее, перезарядка выкупа 2 мин',
        '🎮 По одной замене стартовых активной и пассивной способностей',
      ],
    },
    imagePath: '/images/member/stripe-premium.png',
    priceCentPerUnit: 400,
    reward: { kind: 'member', level: MemberLevel.PREMIUM },
  },
};

// 收银台会把普通换行合并成空格；一串全角空格比任意一行都宽，迫使下一项另起一行
const STRIPE_LINE_BREAK = '　'.repeat(40);

export function joinStripeLines(lines: string[]): string {
  return lines.join(STRIPE_LINE_BREAK);
}

/** 付款按钮上方的提示，告诉玩家这单开给哪个账号 */
export function stripeSubmitMessage(locale: StripeLocale, steamId: number): string {
  switch (locale) {
    case 'zh':
      return `将为 Dota2 ID ${steamId} 开通。付款成功后自动到账，返回网站即可查看。`;
    case 'ru':
      return `Подписка будет активирована для Dota2 ID ${steamId}. После оплаты она начислится автоматически — вернитесь на сайт, чтобы проверить.`;
    default:
      return `This will be activated for Dota2 ID ${steamId}. It's credited automatically after payment — return to the website to check.`;
  }
}
