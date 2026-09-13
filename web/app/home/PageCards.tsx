'use client';

import {
  BookOpen,
  CalendarCheck,
  ChevronRight,
  CirclePlus,
  Crown,
  Sparkles,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import Section from '@/app/components/Section';
import { useAuth } from '@/app/lib/auth';
import { playerPagePath } from '@/app/lib/player-path';

// 顺序固定：第一行是玩家自己的东西，第二行是订阅与查阅
const PAGE_CARDS = [
  { key: 'profile', Icon: UserRound, iconClass: 'text-content' },
  { key: 'property', Icon: CirclePlus, iconClass: 'text-muted' },
  { key: 'awaken', Icon: Sparkles, iconClass: 'text-muted' },
  { key: 'membership', Icon: Crown, iconClass: 'text-member-strong' },
  { key: 'dailyTask', Icon: CalendarCheck, iconClass: 'text-muted' },
  { key: 'wiki', Icon: BookOpen, iconClass: 'text-muted' },
] as const;

export default function PageCards() {
  const t = useTranslations('home.pages');
  const auth = useAuth();

  // 页面没实现的一律不给 href，卡片就停在「即将上线」的样子上
  const uid = auth.status === 'authenticated' ? auth.uid : null;
  const hrefOf: Record<string, string | null> = {
    profile: playerPagePath(uid),
    property: playerPagePath(uid, 'property'),
    membership: '/membership',
  };

  return (
    <Section title={t('title')} containerClassName="max-w-none">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PAGE_CARDS.map(({ key, Icon, iconClass }) => {
          const href = hrefOf[key] ?? null;
          const title = t(`${key}.title`);
          const description = t(`${key}.description`);
          const icon = (
            <Icon className={`size-5 shrink-0 ${iconClass}`} strokeWidth={1.7} aria-hidden="true" />
          );

          if (!href) {
            return (
              <div
                key={key}
                className="flex flex-col gap-2 rounded-[10px] border border-dashed border-line bg-panel p-4"
              >
                <div className="flex items-center gap-2">
                  {icon}
                  <span className="flex-1 text-lg font-bold text-muted">{title}</span>
                </div>
                <p className="text-sm text-muted">{description}</p>
                <span className="self-start rounded-full border border-line bg-panel-soft px-2.5 py-0.5 text-xs text-muted">
                  {t('soon')}
                </span>
              </div>
            );
          }

          return (
            <Link key={key} href={href} className="card-container card-hover flex flex-col gap-2 p-4">
              <div className="flex items-center gap-2">
                {icon}
                <span className="flex-1 text-lg font-bold text-heading">{title}</span>
                <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
              </div>
              <p className="text-sm text-muted">{description}</p>
            </Link>
          );
        })}
      </div>
    </Section>
  );
}
