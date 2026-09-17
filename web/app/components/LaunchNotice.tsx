'use client';

import { Info } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

interface LaunchNoticeProps {
  /** 提示语的主语，属性页说加点、觉醒页说觉醒 */
  subject: 'property' | 'awaken';
  className?: string;
}

/** 一句话说明这一页的改动什么时候在游戏内生效，详情引到 /launch */
export default function LaunchNotice({ subject, className = '' }: LaunchNoticeProps) {
  const t = useTranslations('launch');

  return (
    <div className={`card-container card-pad-sm flex items-start gap-2.5 ${className}`}>
      <Info className="mt-0.5 size-[18px] shrink-0 text-muted" aria-hidden="true" />
      <p className="text-sm text-muted">
        {t(`notice.${subject}`)}{' '}
        <Link href="/launch" className="text-link link-hover whitespace-nowrap">
          {t('notice.link')}
        </Link>
      </p>
    </div>
  );
}
