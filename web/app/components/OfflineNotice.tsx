'use client';

import { Info } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

/** 一句话提醒游戏内读的是离线数据，详情引到 /offline */
export default function OfflineNotice({ className = '' }: { className?: string }) {
  const t = useTranslations('offline');

  return (
    <div className={`card-container card-pad-sm flex items-start gap-2.5 ${className}`}>
      <Info className="mt-0.5 size-[18px] shrink-0 text-muted" aria-hidden="true" />
      <p className="text-sm text-muted">
        {t('short')}{' '}
        <Link href="/offline" className="text-link link-hover whitespace-nowrap">
          {t('link')}
        </Link>
      </p>
    </div>
  );
}
