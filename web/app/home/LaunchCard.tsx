import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

/** 首页上的启动入口，整卡跳 /launch */
export default function LaunchCard() {
  const t = useTranslations('launch');

  return (
    <Link href="/launch" className="card-container card-pad card-hover flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-lg font-bold text-heading">{t('homeCard.title')}</span>
        <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <p className="text-content text-pretty">{t('homeCard.online')}</p>
        {/* 游廊那条只是对照，压一档颜色，免得和推荐的做法抢注意力 */}
        <p className="text-sm text-muted text-pretty">{t('homeCard.offline')}</p>
      </div>
    </Link>
  );
}
