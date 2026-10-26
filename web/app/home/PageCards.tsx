'use client';

import {
  BookOpen,
  CalendarCheck,
  ChartNoAxesColumn,
  Sparkles,
  Trophy,
  UserRound,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import ActionCard from '@/app/components/ActionCard';
import { useAuth } from '@/app/lib/auth';
import { playerPagePath } from '@/app/lib/player-path';

// 顺序与头部菜单的分组一致：先是玩家自己的，再是人人一样的；图标颜色与头部菜单、个人主页入口卡一致
const PAGE_CARDS = [
  { key: 'profile', Icon: UserRound, iconClass: 'text-content', tileClass: 'bg-icon-tile' },
  {
    key: 'property',
    Icon: ChartNoAxesColumn,
    iconClass: 'text-feature-property',
    tileClass: 'bg-feature-property-soft',
  },
  {
    key: 'awaken',
    Icon: Sparkles,
    iconClass: 'text-feature-awaken',
    tileClass: 'bg-feature-awaken-soft',
  },
  {
    key: 'dailyTask',
    Icon: CalendarCheck,
    iconClass: 'text-feature-daily',
    tileClass: 'bg-feature-daily-soft',
  },
  {
    key: 'wiki',
    Icon: BookOpen,
    iconClass: 'text-feature-wiki',
    tileClass: 'bg-feature-wiki-soft',
  },
  { key: 'leaderboard', Icon: Trophy, iconClass: 'text-season', tileClass: 'bg-season-soft' },
] as const;

export default function PageCards() {
  const t = useTranslations('home.pages');
  const auth = useAuth();

  const uid = auth.status === 'authenticated' ? auth.uid : null;
  const hrefOf: Record<(typeof PAGE_CARDS)[number]['key'], string> = {
    profile: playerPagePath(uid),
    property: playerPagePath(uid, 'property'),
    awaken: playerPagePath(uid, 'awaken'),
    dailyTask: playerPagePath(uid, 'daily-task'),
    wiki: '/wiki/abilities',
    leaderboard: '/leaderboard',
  };

  return (
    <section className="flex flex-col gap-3 lg:gap-4">
      <h2 className="title-secondary font-heading text-xl md:text-2xl">{t('title')}</h2>
      <div className="grid gap-2.5 md:grid-cols-2 md:gap-3.5 lg:grid-cols-3">
        {PAGE_CARDS.map(({ key, Icon, iconClass, tileClass }) => (
          <ActionCard
            key={key}
            translucent
            href={hrefOf[key]}
            Icon={Icon}
            iconClassName={iconClass}
            tileClassName={tileClass}
            title={t(`${key}.title`)}
            description={t(`${key}.description`)}
          />
        ))}
      </div>
    </section>
  );
}
