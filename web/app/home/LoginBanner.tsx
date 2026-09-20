'use client';

import { useTranslations } from 'next-intl';

import AcceleratorHint from '@/app/components/AcceleratorHint';
import SteamLoginButton from '@/app/components/SteamLoginButton';

import SampleDataPanel from './SampleDataPanel';

// 盖住示意面板的遮罩，压到底的那一端要接近不透明，否则数字会透过文字
const NARROW_STOPS = 'rgba(15,15,17,0.35) 0%, rgba(15,15,17,0.92) 26%, rgba(15,15,17,1) 38%';
const WIDE_STOPS =
  'rgba(15,15,17,1) 0%, rgba(15,15,17,1) 50%, rgba(15,15,17,0.72) 72%, rgba(15,15,17,0.45) 100%';

export default function LoginBanner() {
  const t = useTranslations('home.intro');

  return (
    <section className="card-container relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <SampleDataPanel />
      </div>
      {/* 文案落在哪半边，遮罩就压哪半边：窄屏文案在下，宽屏在左 */}
      <div
        className="pointer-events-none absolute inset-0 md:hidden"
        style={{ backgroundImage: `linear-gradient(180deg, ${NARROW_STOPS})` }}
      />
      <div
        className="pointer-events-none absolute inset-0 hidden md:block"
        style={{ backgroundImage: `linear-gradient(90deg, ${WIDE_STOPS})` }}
      />
      {/* 窄屏顶部要给背景图让位，所以只借 card-pad 的左右与底，上边距单独给 */}
      <div className="card-pad relative flex flex-col gap-4 pt-36 md:max-w-[460px] md:pt-6 lg:pt-8">
        <h2 className="title-secondary">{t('title')}</h2>
        <p className="text-content">{t('description')}</p>
        <div className="flex flex-col items-start gap-2">
          <SteamLoginButton size="large" />
          <AcceleratorHint />
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
