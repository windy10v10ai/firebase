import { BookOpen, CalendarCheck, ChartNoAxesColumn, ChevronRight, Sparkles } from 'lucide-react';
import { notFound } from 'next/navigation';

import SteamIcon from '../components/SteamIcon';
import Button, { STEAM_BUTTON_CLASS, STEAM_BUTTON_SIZE_CLASS } from '../components/ui/button';

import TokenValue from './token-value';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: '设计规范' };

interface Swatch {
  token: string;
  background?: string;
}

const NEUTRAL: Swatch[] = [
  { token: 'surface' },
  { token: 'panel' },
  { token: 'panel-soft' },
  { token: 'control-hover' },
  { token: 'panel-raised' },
  { token: 'control-active' },
  { token: 'line' },
  { token: 'line-strong' },
  { token: 'heading' },
  { token: 'content' },
  { token: 'muted' },
  { token: 'faint' },
];

const CURRENCY: Swatch[] = [
  { token: 'season' },
  { token: 'season-strong' },
  { token: 'member' },
  { token: 'member-strong' },
];

const BRAND: Swatch[] = [
  { token: 'afdian' },
  { token: 'kofi' },
  { token: 'alipay' },
  { token: 'stripe' },
];

const STATUS: Swatch[] = [
  { token: 'success' },
  { token: 'danger' },
  { token: 'warning' },
  { token: 'discount' },
];

const PRIMARY: Swatch[] = [
  {
    token: 'primary-from',
    background: 'linear-gradient(180deg, var(--color-primary-from), var(--color-primary-to))',
  },
  { token: 'primary-to' },
  { token: 'cta' },
  { token: 'link' },
  { token: 'link-border' },
];

const BUTTON_VARIANTS = [
  'primary',
  'cta',
  'secondary',
  'ghost',
  'danger',
  'season',
  'member',
] as const;

function SwatchGrid({ items }: { items: Swatch[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
      {items.map(({ token, background }) => (
        <div key={token} className="box-pad min-w-0 space-y-2 rounded-lg bg-panel-soft">
          <div
            className="h-12 rounded-md border border-line-strong"
            style={{ background: background ?? `var(--color-${token})` }}
          />
          <p className="text-sm break-all text-heading">--color-{token}</p>
          <TokenValue name={`--color-${token}`} />
        </div>
      ))}
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card-container card-pad space-y-5">
      <h2 className="title-secondary">{title}</h2>
      {children}
    </section>
  );
}

const FEATURES = [
  {
    name: 'property',
    Icon: ChartNoAxesColumn,
    iconClass: 'text-feature-property',
    softClass: 'bg-feature-property-soft',
  },
  {
    name: 'awaken',
    Icon: Sparkles,
    iconClass: 'text-feature-awaken',
    softClass: 'bg-feature-awaken-soft',
  },
  {
    name: 'daily',
    Icon: CalendarCheck,
    iconClass: 'text-feature-daily',
    softClass: 'bg-feature-daily-soft',
  },
  {
    name: 'wiki',
    Icon: BookOpen,
    iconClass: 'text-feature-wiki',
    softClass: 'bg-feature-wiki-soft',
  },
];

const BRAND_TEXT_CLASS: Record<string, string> = {
  afdian: 'text-afdian',
  kofi: 'text-kofi',
  alipay: 'text-alipay',
  stripe: 'text-stripe-text',
};

export default function DesignSystemPage() {
  // 只给开发时对照规范，不对玩家开放
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <h1 className="title-primary">设计规范</h1>

      <Block title="中性">
        <SwatchGrid items={NEUTRAL} />
      </Block>

      <Block title="货币">
        <SwatchGrid items={CURRENCY} />
      </Block>

      <Block title="网站主色">
        <SwatchGrid items={PRIMARY} />
      </Block>

      <Block title="功能色">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {FEATURES.map(({ name, Icon, iconClass, softClass }) => (
            <div key={name} className="box-pad min-w-0 space-y-2 rounded-lg bg-panel-soft">
              <div className={`flex size-12 items-center justify-center rounded-lg ${softClass}`}>
                <Icon className={`size-6 ${iconClass}`} aria-hidden="true" />
              </div>
              <p className="text-sm break-all text-heading">--color-feature-{name}</p>
              <TokenValue name={`--color-feature-${name}`} />
            </div>
          ))}
        </div>
      </Block>

      <Block title="品牌色">
        <SwatchGrid items={BRAND} />
        <p className="flex flex-wrap gap-x-5 gap-y-1 text-base font-bold">
          {BRAND.map(({ token }) => (
            <span key={token} className={BRAND_TEXT_CLASS[token]}>
              {token}
            </span>
          ))}
        </p>
      </Block>

      <Block title="状态色">
        <SwatchGrid items={STATUS} />
      </Block>

      <Block title="按钮">
        <div className="space-y-4">
          {BUTTON_VARIANTS.map((variant) => (
            <div key={variant} className="space-y-2">
              <p className="text-sm text-muted">{variant}</p>
              <div className="flex flex-wrap gap-3">
                <Button variant={variant}>默认</Button>
                <Button variant={variant} disabled>
                  禁用
                </Button>
                <Button variant={variant} loading>
                  提交中
                </Button>
              </div>
            </div>
          ))}
          <div className="space-y-2">
            <p className="text-sm text-muted">steam</p>
            <button
              type="button"
              className={`${STEAM_BUTTON_CLASS} ${STEAM_BUTTON_SIZE_CLASS.default}`}
            >
              <SteamIcon className="size-5 shrink-0" />
              <span>Steam 登录</span>
            </button>
          </div>
        </div>
      </Block>

      <Block title="可点击卡片">
        <a
          href="#"
          className="card-container card-hover card-pad-sm flex items-center gap-3 md:gap-4"
        >
          <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-feature-property-soft">
            <ChartNoAxesColumn className="size-6 text-feature-property" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-bold text-heading">属性加点</span>
            <span className="block text-sm text-muted">用勇士积分提升英雄属性</span>
          </span>
          <span className="hidden h-8 items-center rounded-full border border-capsule-border px-3 text-[13px] text-capsule-text md:inline-flex">
            去加点
          </span>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-arrow-border">
            <ChevronRight className="size-4 text-muted" aria-hidden="true" />
          </span>
        </a>
      </Block>

      <Block title="文字链接">
        <p className="text-base text-content">
          正文里的链接靠下划线认出来，比如
          <a href="#" className="link-inline">
            这一条内联链接
          </a>
          ，悬停时下划线提亮。
        </p>
        <p className="text-sm text-content">
          <a href="#" className="link-hover">
            导航类链接静止是中性色，悬停提亮
          </a>
        </p>
      </Block>
    </div>
  );
}
