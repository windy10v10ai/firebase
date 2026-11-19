'use client';

import { Gift, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';

import AcceleratorHint from '@/app/components/AcceleratorHint';
import SteamLoginButton from '@/app/components/SteamLoginButton';
import { isCompensationOpen } from '@/app/lib/player-info';

import LevelTile from './LevelTile';

// 示意数据写死，只演示「登录后能看到什么」，不请求接口
const SAMPLE_SEASON = {
  level: 23,
  currentLevelPoint: 1110,
  nextLevelPoint: 1790,
  usablePoint: 4820,
};
// 未登录拿不到接口里的积分数，与 api 的发放数额保持一致
const COMPENSATION_SEASON_POINT = 5000;
const SAMPLE_MEMBER = { level: 5, currentLevelPoint: 760, nextLevelPoint: 2000, usablePoint: 1260 };

/** 首屏右侧面板（未登录）：示意一份玩家数据，再给登录入口 */
export default function LoginBanner() {
  const t = useTranslations('home.intro');
  const tSample = useTranslations('home.sample');
  const tSummary = useTranslations('home.summary');
  const tCompensation = useTranslations('compensation');

  return (
    <section className="hero-panel card-pad">
      <div className="flex flex-col gap-1.5">
        <h2 className="font-heading text-xl font-bold text-heading md:text-[22px]">{t('title')}</h2>
        <p className="text-sm text-content">{t('description')}</p>
      </div>

      <div className="box-pad flex flex-col gap-3 rounded-xl border border-dashed border-hero-sample-border bg-hero-sample">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-glass">
            <UserRound className="size-[18px] text-muted" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1 truncate font-bold text-content">{tSample('name')}</span>
          <span className="rounded-full bg-warning px-2.5 py-px text-xs font-extrabold text-primary-text">
            {tSample('tag')}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2.5 opacity-85">
          <LevelTile tone="season" label={tSummary('battleLevel')} values={SAMPLE_SEASON} />
          <LevelTile tone="member" label={tSummary('memberLevel')} values={SAMPLE_MEMBER} />
        </div>
        <p className="text-xs text-muted">{tSample('note')}</p>
      </div>

      {isCompensationOpen() ? (
        <p className="flex items-center gap-2.5 rounded-xl border border-season-border bg-season-soft px-3.5 py-3 text-sm text-content">
          <Gift className="size-[18px] shrink-0 text-season-light" aria-hidden="true" />
          <span>
            {tCompensation.rich('loginHint', {
              amount: COMPENSATION_SEASON_POINT,
              points: (chunks) => <span className="font-bold text-season-light">{chunks}</span>,
            })}
          </span>
        </p>
      ) : null}

      <SteamLoginButton variant="glass" />
      <div className="flex flex-col items-start gap-2">
        <AcceleratorHint />
        <p className="text-sm text-muted">{t('privacy')}</p>
      </div>
    </section>
  );
}
