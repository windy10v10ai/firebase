import { MemberLevel } from '../members/entities/members.entity';

import { StripeProductCode } from './enums/stripe-product-code.enum';

export type StripeReward =
  { kind: 'member'; level: MemberLevel } | { kind: 'points'; points: number };

/** 网站支持的语言，收银台语言与商品文案跟随它 */
export const STRIPE_LOCALES = ['zh', 'en', 'ru'] as const;
export type StripeLocale = (typeof STRIPE_LOCALES)[number];
export const DEFAULT_STRIPE_LOCALE: StripeLocale = 'en';

export interface StripeProductSpec {
  /** 收银台上显示的商品名，含份数 */
  name: (locale: StripeLocale, quantity: number) => string;
  /** 收银台商品名下方的权益列表，每项一行 */
  benefits: Record<StripeLocale, string[]>;
  /** 网站公开目录下的商品图路径 */
  imagePath: string;
  /** 可买的份数及每档总价（分）；表里没有的份数不卖 */
  priceCentByQuantity: Record<number, number>;
  reward: StripeReward;
}

export const STRIPE_CURRENCY = 'usd';

const RU_MONTHS = new Intl.PluralRules('ru');

function memberName(locale: StripeLocale, months: number): string {
  switch (locale) {
    case 'zh':
      return `高级会员 · ${months} 个月`;
    case 'ru': {
      const unit = { one: 'месяц', few: 'месяца' }[RU_MONTHS.select(months)] ?? 'месяцев';
      return `Premium-подписка · ${months} ${unit}`;
    }
    default:
      return `Premium Membership · ${months} ${months === 1 ? 'month' : 'months'}`;
  }
}

const NUMBER_LOCALE: Record<StripeLocale, string> = { zh: 'zh-CN', en: 'en-US', ru: 'ru-RU' };

function pointsProduct(points: number, priceCent: number, imagePath: string): StripeProductSpec {
  const amount = (locale: StripeLocale) => points.toLocaleString(NUMBER_LOCALE[locale]);
  return {
    name: (locale) =>
      locale === 'zh' ? `会员积分 · ${amount(locale)}` : `Member Points · ${amount(locale)}`,
    benefits: {
      zh: [`💎 付款后立即到账 ${amount('zh')} 会员积分`, '📈 用来提升会员等级、升级属性'],
      en: [
        `💎 ${amount('en')} Member Points, credited right after payment`,
        '📈 Use them to raise your Member Level and upgrade attributes',
      ],
      ru: [
        `💎 ${amount('ru')} Member Points сразу после оплаты`,
        '📈 Поднимают Member Level и прокачивают атрибуты',
      ],
    },
    imagePath,
    priceCentByQuantity: { 1: priceCent },
    reward: { kind: 'points', points },
  };
}

// 美元价按支付宝的人民币价折算后取 .99 结尾；多月会员是固定档位，总价按档定，不按月价相乘
export const STRIPE_PRODUCT_TABLE: Record<StripeProductCode, StripeProductSpec> = {
  [StripeProductCode.MEMBER_PREMIUM]: {
    name: memberName,
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
    priceCentByQuantity: { 1: 400, 3: 1149, 12: 4299, 36: 12199 },
    reward: { kind: 'member', level: MemberLevel.PREMIUM },
  },
  [StripeProductCode.POINTS_TIER1]: pointsProduct(4000, 1099, '/images/member/points-1.png'),
  [StripeProductCode.POINTS_TIER2]: pointsProduct(12500, 3399, '/images/member/points-2.png'),
  [StripeProductCode.POINTS_TIER3]: pointsProduct(31000, 8099, '/images/member/points-3.png'),
};

// 收银台会把普通换行合并成空格；一串全角空格比任意一行都宽，迫使下一项另起一行
const STRIPE_LINE_BREAK = '　'.repeat(40);

export function joinStripeLines(lines: string[]): string {
  return lines.join(STRIPE_LINE_BREAK);
}

/** 付款按钮上方的提示，告诉玩家这单发给哪个账号 */
export function stripeSubmitMessage(
  locale: StripeLocale,
  steamId: number,
  kind: StripeReward['kind'],
): string {
  switch (locale) {
    case 'zh':
      return kind === 'member'
        ? `将为 Dota2 ID ${steamId} 开通。付款成功后自动到账，返回网站即可查看。`
        : `积分将发放到 Dota2 ID ${steamId}。付款成功后自动到账，返回网站即可查看。`;
    case 'ru':
      return kind === 'member'
        ? `Подписка будет активирована для Dota2 ID ${steamId}. После оплаты она начислится автоматически — вернитесь на сайт, чтобы проверить.`
        : `Очки будут начислены на Dota2 ID ${steamId}. После оплаты они придут автоматически — вернитесь на сайт, чтобы проверить.`;
    default:
      return kind === 'member'
        ? `This will be activated for Dota2 ID ${steamId}. It's credited automatically after payment — return to the website to check.`
        : `Points will be credited to Dota2 ID ${steamId} automatically after payment — return to the website to check.`;
  }
}
