import { BookOpen } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { pageTitle } from '@/app/lib/page-title';

export const generateMetadata = pageTitle('navigation', 'wikiFull');

export default function WikiLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations();

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-feature-wiki-soft md:size-11">
          <BookOpen className="size-5 text-feature-wiki" strokeWidth={1.7} aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="title-primary">{t('navigation.wikiFull')}</h1>
          <p className="text-sm text-muted md:text-base">{t('wiki.description')}</p>
        </div>
      </div>
      {children}
    </div>
  );
}
