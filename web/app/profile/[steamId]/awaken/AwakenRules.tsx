'use client';

import { useTranslations } from 'next-intl';

/** 觉醒的价格与规则，本人与未登录预览共用 */
export default function AwakenRules() {
  const t = useTranslations('awaken');

  return (
    <section className="card-container card-pad">
      <h2 className="title-secondary mb-3 text-lg">{t('rules.title')}</h2>
      {/* body 没有设默认文字色，富文本里没被 chunk 包住的那部分不给颜色就是黑字 */}
      <div className="flex flex-col gap-1.5 leading-relaxed text-content">
        <p>
          <span className="font-bold text-heading">{t('rules.directLabel')}</span>
          {t('rules.colon')}
          {t.rich('rules.direct', {
            season: (chunks) => <span className="text-season">{chunks}</span>,
            member: (chunks) => <span className="text-member-strong">{chunks}</span>,
            b: (chunks) => <b className="text-heading">{chunks}</b>,
          })}
        </p>
        <p>
          <span className="font-bold text-heading">{t('rules.randomLabel')}</span>
          {t('rules.colon')}
          {t.rich('rules.random', {
            season: (chunks) => <span className="text-season">{chunks}</span>,
            member: (chunks) => <span className="text-member-strong">{chunks}</span>,
            b: (chunks) => <b className="text-heading">{chunks}</b>,
          })}
        </p>
        <p className="mt-1.5 border-t border-line pt-2.5 text-sm text-muted">{t('rules.note')}</p>
      </div>
    </section>
  );
}
