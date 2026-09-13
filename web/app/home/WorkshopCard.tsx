import { useTranslations } from 'next-intl';

import SteamIcon from '@/app/components/SteamIcon';
import { STEAM_BUTTON_CLASS, STEAM_BUTTON_SIZE_CLASS } from '@/app/components/SteamLoginButton';
import { EXTERNAL_LINKS } from '@/config/links';

const WORKSHOP_HREF = EXTERNAL_LINKS.find((link) => link.labelKey === 'workshop')!.href;

/** 订阅地图的入口。整卡不做链接，动作交给按钮，否则按钮嵌在链接里 */
export default function WorkshopCard() {
  const t = useTranslations('home.workshop');

  return (
    <section className="card-container flex flex-col gap-4 p-6">
      <div className="space-y-2">
        <h2 className="title-secondary">{t('title')}</h2>
        <p className="text-content">{t('description')}</p>
      </div>
      <a
        href={WORKSHOP_HREF}
        target="_blank"
        rel="noopener noreferrer"
        className={`${STEAM_BUTTON_CLASS} ${STEAM_BUTTON_SIZE_CLASS.large} self-start`}
      >
        <SteamIcon className="size-6 shrink-0" />
        <span>{t('subscribe')}</span>
      </a>
    </section>
  );
}
