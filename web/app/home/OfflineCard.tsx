import { ChevronRight, Info } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

/** 首页上的离线模式说明入口，整卡跳 /offline */
export default function OfflineCard() {
  const t = useTranslations('offline');

  return (
    <Link href="/offline" className="card-container card-pad card-hover flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Info className="size-5 shrink-0 text-muted" strokeWidth={1.7} aria-hidden="true" />
        <span className="flex-1 text-lg font-bold text-heading">{t('title')}</span>
        <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
      </div>
      <p className="text-content">{t('homeCard')}</p>
    </Link>
  );
}
