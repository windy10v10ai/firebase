import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

/** 首页上的启动方式说明入口，整卡跳 /offline */
export default function OfflineCard() {
  const t = useTranslations('offline');

  return (
    <Link href="/offline" className="card-container card-pad card-hover flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-lg font-bold text-heading">{t('title')}</span>
        <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <p className="text-content text-pretty">{t('homeCard.offline')}</p>
        <p className="text-content text-pretty">{t('homeCard.online')}</p>
      </div>
    </Link>
  );
}
