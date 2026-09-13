'use client';

import { useTranslations } from 'next-intl';

import { EXTERNAL_LINKS } from '@/config/links';

import Card from './components/Card';
import LoginBanner from './home/LoginBanner';
import PageCards from './home/PageCards';
import PlayerSummary from './home/PlayerSummary';
import WorkshopCard from './home/WorkshopCard';
import { useAuth } from './lib/auth';

const OTHER_LINKS = EXTERNAL_LINKS.filter((link) => link.labelKey !== 'workshop');

export default function Home() {
  const t = useTranslations();
  const auth = useAuth();
  const signedIn = auth.status === 'authenticated';

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <section className="py-6 text-center">
        <h1 className="title-primary">{t('home.title')}</h1>
      </section>

      {/* 没登录的人多半还没玩过，先给订阅入口；登录过的已经在玩，这块退到后面 */}
      {signedIn ? <PlayerSummary uid={auth.uid} /> : <WorkshopCard />}
      {signedIn ? null : <LoginBanner />}

      <PageCards />

      {signedIn ? <WorkshopCard /> : null}

      <section className="space-y-6">
        {OTHER_LINKS.map((link) => (
          <Card
            key={link.href}
            href={link.href}
            title={t(`home.${link.labelKey}.title`)}
            description={t(`home.${link.labelKey}.description`)}
          />
        ))}
      </section>
    </div>
  );
}
