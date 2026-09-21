import { useTranslations } from 'next-intl';

import { MAX_STAR } from './task-text';

/** 星级只表示难度，不属于任何一套货币，所以用中性色而不是紫或金 */
export default function Stars({ star }: { star: number }) {
  const t = useTranslations('dailyTask');
  const filled = Math.min(Math.max(star, 0), MAX_STAR);

  return (
    <span className="shrink-0 text-[11px] leading-none tracking-[1px]" title={t('star', { n: filled })}>
      <span className="sr-only">{t('star', { n: filled })}</span>
      <span aria-hidden="true" className="text-heading">
        {'★'.repeat(filled)}
      </span>
      <span aria-hidden="true" className="text-faint">
        {'★'.repeat(MAX_STAR - filled)}
      </span>
    </span>
  );
}
