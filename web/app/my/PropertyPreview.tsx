'use client';

import { useTranslations } from 'next-intl';

import SteamLoginButton from '@/app/components/SteamLoginButton';
import PropertyCard from '@/app/profile/[steamId]/property/PropertyCard';
import { PROPERTY_GROUPS, PROPERTY_LIST } from '@/config/properties';

const CHIP_CLASS = 'inline-flex min-h-9 items-center rounded-lg border px-3 text-sm font-bold';

/** 未登录时的属性页：数值全部来自本地配置，不请求接口，登录入口吸在头部下面 */
export default function PropertyPreview() {
  const t = useTranslations('property');

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="title-primary">{t('title')}</h1>
        <p className="text-sm text-muted">{t('intro')}</p>
      </div>

      <section
        aria-label={t('points.title')}
        className="sticky top-[calc(var(--header-height)+0.5rem)] z-10 -mx-1 bg-surface px-1 pb-2 before:absolute before:inset-x-0 before:-top-2 before:h-2 before:bg-surface"
      >
        <div className="card-container flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:gap-5 md:py-2.5">
          <p className="flex flex-wrap items-center justify-center gap-2.5 md:justify-start">
            <span className={`${CHIP_CLASS} border-season-border bg-season-soft text-season`}>
              {t('points.battleLevel')}
            </span>
            <span aria-hidden="true" className="text-lg font-bold text-muted">
              +
            </span>
            <span
              className={`${CHIP_CLASS} border-member-border bg-member-soft text-member-strong`}
            >
              {t('points.memberLevel')}
            </span>
            <span aria-hidden="true" className="text-lg font-bold text-muted">
              =
            </span>
            <span className="font-bold text-heading">{t('points.title')}</span>
          </p>
          <span className="text-center text-sm text-muted md:ml-auto md:text-right">
            {t('preview.hint')}
          </span>
          <SteamLoginButton size="wide" className="w-full md:w-auto" />
        </div>
      </section>

      {PROPERTY_GROUPS.map((group) => (
        <section key={group} className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="title-secondary">{t(`group.${group}.title`)}</h2>
            <span className="text-sm text-muted">{t(`group.${group}.hint`)}</span>
          </div>
          <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
            {PROPERTY_LIST.filter((def) => def.group === group).map((def) => (
              <PropertyCard
                key={def.name}
                def={def}
                level={0}
                pendingCells={0}
                usablePoints={null}
                busy={false}
                readOnly
                preview
                onPendingChange={() => {}}
                onUpgrade={() => {}}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
