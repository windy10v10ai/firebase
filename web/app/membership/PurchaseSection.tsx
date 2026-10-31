'use client';

/* eslint-disable @next/next/no-img-element -- 平台图标与积分图是本地静态小图，尺寸已经接近目标尺寸，不必过 next/image 优化器 */

import { ExternalLink, LoaderCircle, Lock } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';

import CopyIdButton from '@/app/components/CopyIdButton';
import SteamLoginButton from '@/app/components/SteamLoginButton';
import { useAuth } from '@/app/lib/auth';
import { createStripeOrder } from '@/app/lib/stripe';
import {
  AFDIAN_MEMBER_PRICE,
  ALIPAY_MEMBER_TIERS,
  DEFAULT_PLATFORM_BY_LOCALE,
  KOFI_MEMBER_PRICE,
  KOFI_MEMBER_URL,
  PAYMENT_PLATFORMS,
  PLATFORM_ICONS,
  PLATFORM_PARAM,
  POINTS_TIERS,
  RECOMMENDED_PLATFORMS,
  STRIPE_MEMBER_TIERS,
  STRIPE_PAY_LOGOS,
  afdianMemberUrl,
  afdianPointsUrl,
  isPaymentPlatform,
  type MemberTier,
  type PaymentPlatform,
  type PointsTier,
  type StripeMemberTier,
  type StripeProductCode,
} from '@/config/membership';

import type { AlipayRequest } from './AlipayPayDialog';

interface PurchaseSectionProps {
  /** 未登录时为 null：支付宝档位点了提示登录，Stripe 点了去登录，爱发电、Ko-fi 照常跳转 */
  steamId: string | null;
  onAlipay: (request: AlipayRequest) => void;
}

const DISCOUNT_CLASS =
  'rounded border border-discount bg-black/60 px-1.5 text-[11px] font-bold text-discount';

// 整块购买区只属于选中的平台，顶条与悬停描边都用平台色回答「现在用哪家付」；底色仍是中性色
const PLATFORM_STYLE: Record<
  PaymentPlatform,
  { tier: string; tabOn: string; desc: string; note: string; link: string; currency: string }
> = {
  alipay: {
    tier: 'border-t-alipay hover:border-x-alipay/50 hover:border-b-alipay/50',
    tabOn: 'border-alipay bg-alipay/10',
    desc: 'text-alipay',
    note: 'border-alipay/35 bg-alipay/8',
    link: 'text-alipay',
    currency: '¥',
  },
  afdian: {
    tier: 'border-t-afdian hover:border-x-afdian/50 hover:border-b-afdian/50',
    tabOn: 'border-afdian bg-afdian/10',
    desc: 'text-afdian',
    note: 'border-afdian/35 bg-afdian/8',
    link: 'text-afdian',
    currency: '¥',
  },
  stripe: {
    tier: 'border-t-stripe hover:border-x-stripe/50 hover:border-b-stripe/50',
    tabOn: 'border-stripe bg-stripe/10',
    desc: 'text-stripe-text',
    note: 'border-stripe/35 bg-stripe/8',
    link: 'text-stripe-text',
    currency: 'US$',
  },
  kofi: {
    tier: 'border-t-kofi hover:border-x-kofi/50 hover:border-b-kofi/50',
    tabOn: 'border-kofi bg-kofi/10',
    desc: 'text-kofi',
    note: 'border-kofi/35 bg-kofi/8',
    link: 'text-kofi',
    currency: '$',
  },
};

// 与启动器页的「推荐」同一枚绿色胶囊。窄屏压在标签右上角的边框上，外层垫一层不透明底，免得边框穿过文字
const RECOMMEND_CLASS =
  'absolute -end-1 -top-3 overflow-hidden rounded-full border border-success/40 bg-panel lg:static';

const TIER_CLASS =
  'flex w-full min-w-0 rounded-xl border border-line border-t-[3px] bg-panel-soft text-start text-heading transition-colors hover:bg-control-hover';

interface TierProps {
  tier: string;
  className: string;
  /** 支付宝开弹窗、Stripe 下单后跳收银台，其他平台新窗口跳转 */
  action: { onClick: () => void } | { href: string };
  disabled?: boolean;
  children: ReactNode;
}

/** 档位本身就是付款入口 */
function Tier({ tier, className, action, disabled, children }: TierProps) {
  const classes = `${TIER_CLASS} ${tier} ${className}`;
  if ('href' in action) {
    return (
      <a href={action.href} target="_blank" rel="noopener noreferrer" className={classes}>
        {children}
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={action.onClick}
      disabled={disabled}
      className={`${classes} disabled:pointer-events-none`}
    >
      {children}
    </button>
  );
}

// 本标签页的会话存储不会被别处改动，只在渲染时读一次
const subscribeNothing = () => () => {};

function readRememberedPlatform(): PaymentPlatform | null {
  try {
    const value = sessionStorage.getItem(PLATFORM_PARAM);
    return isPaymentPlatform(value) ? value : null;
  } catch {
    return null;
  }
}

export default function PurchaseSection({ steamId, onAlipay }: PurchaseSectionProps) {
  const t = useTranslations('membership');
  const tIdentity = useTranslations('profile.identity');
  const locale = useLocale();
  const param = useSearchParams().get(PLATFORM_PARAM);
  const requestedPlatform = isPaymentPlatform(param) ? param : null;
  const rememberedPlatform = useSyncExternalStore(
    subscribeNothing,
    readRememberedPlatform,
    () => null,
  );
  const [chosenPlatform, setPlatform] = useState<PaymentPlatform | null>(null);
  const platform =
    chosenPlatform ??
    requestedPlatform ??
    rememberedPlatform ??
    DEFAULT_PLATFORM_BY_LOCALE[locale] ??
    'kofi';
  const sectionRef = useRef<HTMLElement>(null);
  const style = PLATFORM_STYLE[platform];
  const money = (amount: string) => `${style.currency}${amount}`;
  const perMonth = t('member.perMonth');
  const pathname = usePathname();
  const { loginUrl } = useAuth();
  // 正在下单的档位与下单失败的区块；一次只下一单，下单中其他档位不可点
  const [stripePending, setStripePending] = useState<string | null>(null);
  const [stripeFailed, setStripeFailed] = useState<'member' | 'points' | null>(null);

  // 从收银台按浏览器后退时页面可能取自往返缓存，按钮会停在跳转中
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        setStripePending(null);
      }
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  // 从游戏带着指定标签进来时，付款区在会员说明下方、首屏看不到，直接滚过去。
  // 登录各入口回跳都只带路径，标签记在本标签页里，登录回来仍停在原标签
  useEffect(() => {
    if (!requestedPlatform) {
      return;
    }
    try {
      sessionStorage.setItem(PLATFORM_PARAM, requestedPlatform);
    } catch {
      // 存储被禁用时只是登录回来落到默认标签
    }
    sectionRef.current?.scrollIntoView({ block: 'start' });
  }, [requestedPlatform]);

  const startStripe = async (productCode: StripeProductCode, quantity: number) => {
    if (!steamId) {
      window.location.assign(loginUrl(pathname));
      return;
    }
    setStripePending(`${productCode}-${quantity}`);
    setStripeFailed(null);
    try {
      const { checkoutUrl } = await createStripeOrder({ productCode, quantity, locale });
      window.location.assign(checkoutUrl);
    } catch {
      setStripePending(null);
      setStripeFailed(productCode === 'MEMBER_PREMIUM' ? 'member' : 'points');
    }
  };

  const redirecting = (
    <span className="flex items-center gap-2 text-sm font-bold text-content">
      <LoaderCircle className="size-4 animate-spin text-link" aria-hidden="true" />
      {t('member.redirecting')}
    </span>
  );

  const orderFailed = (kind: 'member' | 'points') =>
    stripeFailed === kind ? (
      <p role="alert" className="text-sm text-danger">
        {t('member.orderFailed')}
      </p>
    ) : null;

  const memberSubtitle =
    platform === 'alipay'
      ? t('member.subtitle')
      : platform === 'stripe'
        ? t('member.oneTime')
        : t('member.monthly');

  const memberTitle = (
    <div className="flex flex-col gap-1">
      <h2 className="flex items-center gap-2 text-xl font-extrabold text-member-strong lg:text-[22px]">
        <img
          src="/images/member/crown-gold.png"
          alt=""
          width={30}
          height={30}
          className="size-[26px] shrink-0 lg:size-[30px]"
        />
        {t('member.title')}
      </h2>
      <p className="text-sm text-muted">{memberSubtitle}</p>
    </div>
  );

  const stripeMemberTier = (tier: StripeMemberTier) => {
    const pending = stripePending === `MEMBER_PREMIUM-${tier.months}`;
    const discounted = tier.discountPercent > 0;
    return (
      <Tier
        key={tier.months}
        tier={style.tier}
        className="h-[72px] items-center px-4 lg:h-[104px]"
        disabled={stripePending !== null}
        action={{ onClick: () => void startStripe('MEMBER_PREMIUM', tier.months) }}
      >
        {/* 与支付宝档位同一套网格：电脑档月数单独占一行，原价在现价正上方 */}
        <span className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5">
          <span className="col-start-1 row-start-1 truncate text-base font-extrabold md:text-lg lg:col-span-2 lg:text-xl">
            {t('member.months', { count: tier.months })}
          </span>
          <span className="col-start-1 row-start-2 truncate text-xs text-muted lg:text-[13px]">
            {discounted ? t('member.perMonthApprox', { amount: money(tier.perMonth) }) : null}
          </span>
          {pending ? (
            <span className="col-start-2 row-span-2 row-start-1 justify-self-end lg:col-span-2 lg:col-start-1 lg:row-span-1 lg:row-start-3 lg:justify-self-end">
              {redirecting}
            </span>
          ) : (
            <>
              {discounted ? (
                <s className="col-start-2 row-start-1 justify-self-end text-xs whitespace-nowrap text-muted lg:row-start-2">
                  {money((Number(KOFI_MEMBER_PRICE) * tier.months).toFixed(2))}
                </s>
              ) : null}
              <span className="col-start-2 row-start-2 flex items-center gap-1.5 justify-self-end whitespace-nowrap lg:col-span-2 lg:col-start-1 lg:row-start-3">
                {discounted ? (
                  <span className={DISCOUNT_CLASS}>-{tier.discountPercent}%</span>
                ) : null}
                <span className="text-base font-bold md:text-lg lg:text-xl">
                  {money(tier.total)}
                </span>
              </span>
            </>
          )}
        </span>
      </Tier>
    );
  };

  const payLogos = (
    <span className="flex items-center gap-1.5">
      {STRIPE_PAY_LOGOS.map((logo) => (
        <span key={logo.name} className="flex h-6 items-center rounded bg-white px-1.5">
          <img src={logo.src} alt={logo.name} style={{ height: logo.height }} className="w-auto" />
        </span>
      ))}
    </span>
  );

  const alipayMemberTier = (tier: MemberTier) => (
    <Tier
      key={tier.months}
      tier={style.tier}
      className="h-[72px] items-center px-4 lg:h-[104px]"
      action={{
        onClick: () =>
          onAlipay({
            productCode: 'MEMBER_PREMIUM',
            quantity: tier.months,
            kind: 'member',
            months: tier.months,
          }),
      }}
    >
      {/* 电脑档四列卡片太窄，月数单独占一行，原价仍在现价正上方 */}
      <span className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5">
        <span className="col-start-1 row-start-1 truncate text-base font-extrabold md:text-lg lg:col-span-2 lg:text-xl">
          {t('member.months', { count: tier.months })}
        </span>
        <span className="col-start-1 row-start-2 truncate text-xs text-muted lg:text-[13px]">
          {t('member.total', { amount: money(tier.total) })}
        </span>
        <s className="col-start-2 row-start-1 justify-self-end text-xs whitespace-nowrap text-muted lg:row-start-2">
          {money(AFDIAN_MEMBER_PRICE)}
          {perMonth}
        </s>
        <span className="col-start-2 row-start-2 flex items-center gap-1.5 justify-self-end whitespace-nowrap lg:col-span-2 lg:col-start-1 lg:row-start-3">
          <span className={DISCOUNT_CLASS}>-{tier.discountPercent}%</span>
          <span className="text-base font-bold md:text-lg lg:text-xl">
            {money(tier.pricePerMonth)}
          </span>
          <span className="text-xs text-muted">{perMonth}</span>
        </span>
      </span>
    </Tier>
  );

  const externalMemberTier = (href: string, price: string, label: string) => (
    <Tier
      tier={style.tier}
      className="h-[72px] items-center gap-4 px-4 lg:h-[104px]"
      action={{ href }}
    >
      <span className="text-lg font-extrabold whitespace-nowrap lg:text-xl">
        {t('member.months', { count: 1 })}
      </span>
      <span className="flex items-baseline gap-1 whitespace-nowrap">
        <span className="text-lg font-bold lg:text-xl">{money(price)}</span>
        <span className="text-xs text-muted">{perMonth}</span>
      </span>
      <span className="ms-auto flex min-w-0 items-center gap-2 text-sm font-bold text-content">
        <span className="hidden truncate md:inline">{label}</span>
        <ExternalLink className="size-4 shrink-0 text-muted" aria-hidden="true" />
      </span>
    </Tier>
  );

  const pointsTier = (tier: PointsTier) => {
    // 手机与电脑档卡片放不下图、积分数与价格三列，积分数单独占一行；平板是通栏，放得下
    const pointsBody = (price: ReactNode) => (
      <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-0.5 lg:gap-y-1">
        <span className="col-span-2 flex min-w-0 flex-row items-baseline gap-1.5 md:col-span-1 md:flex-col md:items-start md:gap-0.5 lg:col-span-2 lg:flex-row lg:items-baseline lg:gap-1.5">
          <span className="truncate text-base font-extrabold text-member md:text-lg lg:text-xl">
            {tier.points.toLocaleString()}
          </span>
          <span className="truncate text-xs text-muted">{t('points.unit')}</span>
        </span>
        <span className="col-span-2 justify-self-end md:col-span-1 lg:col-span-2">{price}</span>
      </span>
    );
    const image = (
      <img
        src={tier.image}
        alt=""
        width={100}
        height={66}
        className="h-12 w-18 shrink-0 rounded-md object-contain md:h-14 md:w-21 lg:h-[66px] lg:w-25"
      />
    );
    const shared = {
      tier: style.tier,
      className: 'h-20 items-center gap-2.5 ps-1.5 pe-4 lg:h-24',
    };

    if (platform === 'alipay') {
      const saved = (Number(tier.afdianPrice) - Number(tier.alipayPrice)).toFixed(0);
      return (
        <Tier
          key={tier.points}
          {...shared}
          action={{
            onClick: () =>
              onAlipay({
                productCode: tier.alipayProductCode,
                quantity: 1,
                kind: 'points',
                points: tier.points,
                image: tier.image,
              }),
          }}
        >
          {image}
          {pointsBody(
            <span className="flex flex-col items-end gap-0.5">
              <s className="text-xs whitespace-nowrap text-muted">{money(tier.afdianPrice)}</s>
              <span className="flex items-center gap-1.5 whitespace-nowrap">
                <span className={DISCOUNT_CLASS}>{t('points.save', { amount: money(saved) })}</span>
                <span className="text-base font-bold lg:text-lg">{money(tier.alipayPrice)}</span>
              </span>
            </span>,
          )}
        </Tier>
      );
    }

    if (platform === 'stripe') {
      const pending = stripePending === `${tier.stripeProductCode}-1`;
      const saved = (Number(tier.kofiPrice) - Number(tier.stripePrice)).toFixed(0);
      return (
        <Tier
          key={tier.points}
          {...shared}
          disabled={stripePending !== null}
          action={{ onClick: () => void startStripe(tier.stripeProductCode, 1) }}
        >
          {image}
          {pointsBody(
            pending ? (
              redirecting
            ) : (
              <span className="flex flex-col items-end gap-0.5">
                <s className="text-xs whitespace-nowrap text-muted">{money(tier.kofiPrice)}</s>
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                  <span className={DISCOUNT_CLASS}>
                    {t('points.save', { amount: money(saved) })}
                  </span>
                  <span className="text-base font-bold lg:text-lg">{money(tier.stripePrice)}</span>
                </span>
              </span>
            ),
          )}
        </Tier>
      );
    }

    const href = platform === 'afdian' ? afdianPointsUrl(tier, steamId) : tier.kofiUrl;
    const price = platform === 'afdian' ? tier.afdianPrice : tier.kofiPrice;
    return (
      <Tier key={tier.points} {...shared} action={{ href }}>
        {image}
        {pointsBody(
          <span className="flex items-center gap-2 whitespace-nowrap">
            <span className="text-base font-bold lg:text-lg">{money(price)}</span>
            <ExternalLink className="size-4 text-muted" aria-hidden="true" />
          </span>,
        )}
      </Tier>
    );
  };

  // 爱发电登录后链接自带 ID，其余情况都要玩家自己在留言里填 ID
  const asksForId = platform === 'kofi' || (platform === 'afdian' && !steamId);
  const noteContent =
    platform === 'stripe' ? (
      <span className="flex items-start gap-2">
        <Lock className={`mt-0.5 size-4 shrink-0 ${style.desc}`} aria-hidden="true" />
        {t(steamId ? 'platforms.stripe.note' : 'platforms.stripe.noteGuest')}
      </span>
    ) : !steamId ? (
      t(asksForId ? 'idNoteGuest' : 'platforms.alipay.noteGuest')
    ) : asksForId ? (
      <>
        {t('idNote')}
        <span className="inline-flex items-center gap-1 font-bold text-heading">
          {steamId}
          <CopyIdButton
            value={steamId}
            tooltip={tIdentity('copyId.tooltip')}
            copiedLabel={tIdentity('copyId.copied')}
          />
        </span>
      </>
    ) : (
      t(`platforms.${platform === 'alipay' ? 'alipay' : 'afdian'}.note`)
    );

  const manualActivate = (href: string) => (
    <span className="text-[13px] text-muted lg:ms-auto">
      {t('forgotId')}
      <Link href={href} className={`font-bold hover:brightness-125 ${style.link}`}>
        {t('manualActivate')}
      </Link>
    </span>
  );

  return (
    <section ref={sectionRef} className="card-container card-pad flex flex-col gap-4 scroll-mt-4">
      <div
        role="tablist"
        aria-label={t('platformLabel')}
        className="grid grid-cols-4 gap-2 lg:gap-3"
      >
        {PAYMENT_PLATFORMS.map((key) => {
          const on = key === platform;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setPlatform(key)}
              className={`relative flex h-[72px] min-w-0 flex-col items-center justify-center gap-1 rounded-[10px] border px-1 text-center transition-colors lg:flex-row lg:justify-start lg:gap-3 lg:px-4 lg:text-start ${
                on
                  ? `border-2 ${PLATFORM_STYLE[key].tabOn}`
                  : 'border-line bg-panel-soft hover:bg-control-hover'
              }`}
            >
              <img
                src={PLATFORM_ICONS[key]}
                alt=""
                width={40}
                height={40}
                className="size-7 shrink-0 rounded-lg lg:size-10"
              />
              <span className="flex min-w-0 flex-col">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={`truncate text-sm font-bold lg:text-base ${on ? 'text-heading' : 'text-content'}`}
                  >
                    {t(`platforms.${key}.name`)}
                  </span>
                  {RECOMMENDED_PLATFORMS.includes(key) ? (
                    <span className={RECOMMEND_CLASS}>
                      <span className="block bg-success/10 px-1.5 text-[11px] leading-4 font-medium whitespace-nowrap text-success lg:px-2 lg:text-xs lg:leading-5">
                        {t('recommended')}
                      </span>
                    </span>
                  ) : null}
                </span>
                <span
                  className={`hidden text-[13px] leading-tight lg:line-clamp-2 ${on ? PLATFORM_STYLE[key].desc : 'text-muted'}`}
                >
                  {t(`platforms.${key}.desc`)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-col items-center gap-2 lg:hidden">
        <p className={`text-center text-[13px] ${style.desc}`}>{t(`platforms.${platform}.desc`)}</p>
        {platform === 'stripe' ? payLogos : null}
      </div>

      <div
        className={`flex flex-col gap-1 rounded-lg border px-4 py-3 text-sm text-content lg:min-h-12 lg:flex-row lg:items-center lg:gap-3 lg:py-2 ${style.note}`}
      >
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">{noteContent}</span>
        {!steamId ? (
          <span className="self-start lg:ms-auto lg:self-auto">
            <SteamLoginButton />
          </span>
        ) : platform === 'stripe' ? (
          <span className="hidden lg:ms-auto lg:flex">{payLogos}</span>
        ) : platform === 'afdian' ? (
          manualActivate('/regist/afdian')
        ) : platform === 'kofi' ? (
          manualActivate('/regist/kofi')
        ) : null}
      </div>

      <div className="mt-2 flex flex-col gap-3">
        {memberTitle}
        {platform === 'alipay' ? (
          <div className="grid gap-2.5 lg:grid-cols-4 lg:gap-4">
            {ALIPAY_MEMBER_TIERS.map(alipayMemberTier)}
          </div>
        ) : platform === 'stripe' ? (
          <div className="grid gap-2.5 lg:grid-cols-4 lg:gap-4">
            {STRIPE_MEMBER_TIERS.map(stripeMemberTier)}
          </div>
        ) : platform === 'afdian' ? (
          externalMemberTier(
            afdianMemberUrl(steamId),
            AFDIAN_MEMBER_PRICE,
            t('member.subscribeAfdian'),
          )
        ) : (
          externalMemberTier(KOFI_MEMBER_URL, KOFI_MEMBER_PRICE, t('member.subscribeKofi'))
        )}
        {orderFailed('member')}
      </div>

      <hr className="mt-3 border-line" />

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-extrabold text-member lg:text-[22px]">{t('points.title')}</h2>
          <p className="text-sm text-muted">{t('points.subtitle')}</p>
        </div>
        <div className="grid gap-2.5 lg:grid-cols-3 lg:gap-4">{POINTS_TIERS.map(pointsTier)}</div>
        {orderFailed('points')}
      </div>
    </section>
  );
}
