'use client';

import { Play } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import SteamIcon from '@/app/components/SteamIcon';
import { useAuth } from '@/app/lib/auth';
import { EXTERNAL_LINKS } from '@/config/links';

import HeroBackdrop from './HeroBackdrop';
import LoginBanner from './LoginBanner';
import PlayerSummary from './PlayerSummary';

const WORKSHOP_HREF = EXTERNAL_LINKS.find((link) => link.labelKey === 'workshop')!.href;

// 手机上两个按钮各占半行，文案长的语言允许折成两行，所以收窄内边距与字号
const HERO_BUTTON_CLASS = 'btn-glass px-3 text-center text-sm leading-tight lg:px-5 lg:text-[15px]';

/** 首页首屏：左边是标题与两个入口，右边是登录引导或玩家概览 */
export default function Hero() {
  const t = useTranslations('home');
  const auth = useAuth();
  // 中文标题与副标题按意思断行，其他语言自动折行
  const br = () => <br />;

  return (
    <section className="relative">
      <HeroBackdrop />
      <div className="grid gap-6 pt-40 pb-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-center lg:gap-12 lg:pt-16 lg:pb-26">
        <div className="flex flex-col gap-3.5 lg:max-w-[32.5rem] lg:gap-5.5">
          <h1 className="font-heading text-[34px] leading-[1.2] font-black text-balance text-heading md:text-[44px] lg:text-[54px] lg:leading-[1.15]">
            {t.rich('title', { br })}
          </h1>
          <p className="text-[15px] text-content lg:text-lg">
            {t.rich('workshop.description', { br })}
          </p>
          <div className="mt-1 grid grid-cols-2 gap-2.5 lg:flex lg:gap-3">
            <a
              href={WORKSHOP_HREF}
              target="_blank"
              rel="noopener noreferrer"
              className={HERO_BUTTON_CLASS}
            >
              <SteamIcon className="size-5 shrink-0" />
              {t('workshop.subscribe')}
            </a>
            <Link href="/launch" className={HERO_BUTTON_CLASS}>
              <Play className="size-[17px] shrink-0" aria-hidden="true" />
              {t('hero.downloadLauncher')}
            </Link>
          </div>
        </div>
        {auth.status === 'authenticated' ? <PlayerSummary uid={auth.uid} /> : <LoginBanner />}
      </div>
    </section>
  );
}
