'use client';

/* eslint-disable @next/next/no-img-element -- 平台图标与积分图是本地静态小图，尺寸已经接近目标尺寸，不必过 next/image 优化器 */

import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';

import CopyIdButton from '@/app/components/CopyIdButton';
import SteamLoginButton from '@/app/components/SteamLoginButton';
import {
  AFDIAN_MEMBER_PRICE,
  ALIPAY_MEMBER_TIERS,
  DEFAULT_PLATFORM_BY_LOCALE,
  KOFI_MEMBER_PRICE,
  KOFI_MEMBER_URL,
  PAYMENT_PLATFORMS,
  PLATFORM_ICONS,
  POINTS_TIERS,
  afdianMemberUrl,
  afdianPointsUrl,
  type MemberTier,
  type PaymentPlatform,
  type PointsTier,
} from '@/config/membership';

import type { AlipayRequest } from './AlipayPayDialog';

interface PurchaseSectionProps {
  /** 未登录时为 null：支付宝档位点了提示登录，爱发电、Ko-fi 照常跳转 */
  steamId: string | null;
  onAlipay: (request: AlipayRequest) => void;
}

const DISCOUNT_CLASS =
  'rounded border border-discount bg-black/60 px-1.5 text-[11px] font-bold text-discount';

// 顶条只回答「现在用哪家付」，描边、底色、悬停仍是中性色
const PLATFORM_STYLE: Record<
  PaymentPlatform,
  { topBar: string; tabOn: string; desc: string; note: string; link: string; currency: string }
> = {
  alipay: {
    topBar: 'border-t-alipay',
    tabOn: 'border-alipay bg-alipay/10',
    desc: 'text-alipay',
    note: 'border-alipay/35 bg-alipay/8',
    link: 'text-alipay',
    currency: '¥',
  },
  afdian: {
    topBar: 'border-t-afdian',
    tabOn: 'border-afdian bg-afdian/10',
    desc: 'text-afdian',
    note: 'border-afdian/35 bg-afdian/8',
    link: 'text-afdian',
    currency: '¥',
  },
  kofi: {
    topBar: 'border-t-kofi',
    tabOn: 'border-kofi bg-kofi/10',
    desc: 'text-kofi',
    note: 'border-kofi/35 bg-kofi/8',
    link: 'text-kofi',
    currency: '$',
  },
};

const TIER_CLASS =
  'flex w-full min-w-0 rounded-xl border border-line border-t-[3px] bg-panel-soft text-start text-heading transition-colors hover:border-x-link-border hover:border-b-link-border hover:bg-control-hover';

interface TierProps {
  topBar: string;
  className: string;
  /** 支付宝开弹窗，其他平台新窗口跳转 */
  action: { onClick: () => void } | { href: string };
  children: ReactNode;
}

/** 档位本身就是付款入口 */
function Tier({ topBar, className, action, children }: TierProps) {
  const classes = `${TIER_CLASS} ${topBar} ${className}`;
  if ('href' in action) {
    return (
      <a href={action.href} target="_blank" rel="noopener noreferrer" className={classes}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={action.onClick} className={classes}>
      {children}
    </button>
  );
}

export default function PurchaseSection({ steamId, onAlipay }: PurchaseSectionProps) {
  const t = useTranslations('membership');
  const tIdentity = useTranslations('profile.identity');
  const locale = useLocale();
  const [platform, setPlatform] = useState<PaymentPlatform>(
    DEFAULT_PLATFORM_BY_LOCALE[locale] ?? 'kofi',
  );
  const style = PLATFORM_STYLE[platform];
  const money = (amount: string) => `${style.currency}${amount}`;
  const perMonth = t('member.perMonth');

  const memberTitle = (
    <div className="flex flex-col gap-1">
      <h2 className="text-xl font-extrabold text-member-strong lg:text-[22px]">{t('member.title')}</h2>
      <p className="text-sm text-muted">
        {platform === 'alipay' ? t('member.subtitle') : t('member.monthly')}
      </p>
    </div>
  );

  const alipayMemberTier = (tier: MemberTier) => (
    <Tier
      key={tier.months}
      topBar={style.topBar}
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
          <span className="text-base font-bold md:text-lg lg:text-xl">{money(tier.pricePerMonth)}</span>
          <span className="text-xs text-muted">{perMonth}</span>
        </span>
      </span>
    </Tier>
  );

  const externalMemberTier = (href: string, price: string, label: string) => (
    <Tier
      topBar={style.topBar}
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
      topBar: style.topBar,
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
  const noteContent = !steamId ? (
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
    <section className="card-container card-pad flex flex-col gap-4">
      <div role="tablist" aria-label={t('platformLabel')} className="grid grid-cols-3 gap-2 lg:gap-3">
        {PAYMENT_PLATFORMS.map((key) => {
          const on = key === platform;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setPlatform(key)}
              className={`flex h-[72px] min-w-0 flex-col items-center justify-center gap-1 rounded-[10px] border px-2 text-center transition-colors md:flex-row md:justify-start md:gap-3 md:px-4 md:text-start ${
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
                className="size-7 shrink-0 rounded-lg md:size-10"
              />
              <span className="flex min-w-0 flex-col">
                <span className={`truncate text-sm font-bold md:text-base ${on ? 'text-heading' : 'text-content'}`}>
                  {t(`platforms.${key}.name`)}
                </span>
                <span
                  className={`hidden text-[13px] leading-tight md:line-clamp-2 ${on ? PLATFORM_STYLE[key].desc : 'text-muted'}`}
                >
                  {t(`platforms.${key}.desc`)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <p className={`text-center text-[13px] md:hidden ${style.desc}`}>{t(`platforms.${platform}.desc`)}</p>

      <div
        className={`flex flex-col gap-1 rounded-lg border px-4 py-3 text-sm text-content lg:h-12 lg:flex-row lg:items-center lg:gap-3 lg:py-0 ${style.note}`}
      >
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">{noteContent}</span>
        {!steamId ? (
          <span className="self-start lg:ms-auto lg:self-auto">
            <SteamLoginButton />
          </span>
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
        ) : platform === 'afdian' ? (
          externalMemberTier(
            afdianMemberUrl(steamId),
            AFDIAN_MEMBER_PRICE,
            t('member.subscribeAfdian'),
          )
        ) : (
          externalMemberTier(KOFI_MEMBER_URL, KOFI_MEMBER_PRICE, t('member.subscribeKofi'))
        )}
      </div>

      <hr className="mt-3 border-line" />

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-extrabold text-member lg:text-[22px]">{t('points.title')}</h2>
          <p className="text-sm text-muted">{t('points.subtitle')}</p>
        </div>
        <div className="grid gap-2.5 lg:grid-cols-3 lg:gap-4">{POINTS_TIERS.map(pointsTier)}</div>
      </div>
    </section>
  );
}
