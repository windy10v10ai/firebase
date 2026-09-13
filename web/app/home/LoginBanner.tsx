'use client';

import { useTranslations } from 'next-intl';

import SteamLoginButton from '@/app/components/SteamLoginButton';
import { useAuth } from '@/app/lib/auth';

import SampleDataPanel from './SampleDataPanel';

// 盖住示意面板的遮罩，压到底的那一端要接近不透明，否则数字会透过文字
const NARROW_STOPS = 'rgba(15,15,17,0.35) 0%, rgba(15,15,17,0.92) 26%, rgba(15,15,17,1) 38%';
const WIDE_STOPS =
  'rgba(15,15,17,1) 0%, rgba(15,15,17,1) 50%, rgba(15,15,17,0.72) 72%, rgba(15,15,17,0.45) 100%';

export default function LoginBanner() {
  const t = useTranslations('home.intro');
  const auth = useAuth();

  return (
    <section className="card-container relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <SampleDataPanel />
      </div>
      {/* 文案落在哪半边，遮罩就压哪半边：窄屏文案在下，宽屏在左 */}
      <div
        className="pointer-events-none absolute inset-0 sm:hidden"
        style={{ backgroundImage: `linear-gradient(180deg, ${NARROW_STOPS})` }}
      />
      <div
        className="pointer-events-none absolute inset-0 hidden sm:block"
        style={{ backgroundImage: `linear-gradient(90deg, ${WIDE_STOPS})` }}
      />
      <div className="relative flex flex-col gap-4 px-5 pt-36 pb-5 sm:max-w-[460px] sm:p-8">
        <h2 className="title-secondary">{t('title')}</h2>
        <p className="text-content">{t('description')}</p>
        <div className="flex flex-col items-start gap-2">
          {/* 登录链接要读 window.location 拼回调地址，服务端渲染不到，先占住高度 */}
          {auth.status === 'unauthenticated' ? (
            <SteamLoginButton size="large" />
          ) : (
            <span className="min-h-14" aria-hidden="true" />
          )}
          <p className="text-sm text-muted">{t('privacy')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {t.raw('upcoming').map((item: string) => (
            <span
              key={item}
              className="rounded-full border border-line bg-panel-soft px-2.5 py-0.5 text-xs text-muted"
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
