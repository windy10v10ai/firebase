'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { EXTERNAL_LINKS } from '@/config/links';

import Card from './components/Card';
import LoginBanner from './home/LoginBanner';
import LaunchCard from './home/LaunchCard';
import PageCards from './home/PageCards';
import PlayerSummary from './home/PlayerSummary';
import WorkshopCard from './home/WorkshopCard';
import { useAuth } from './lib/auth';

const OTHER_LINKS = EXTERNAL_LINKS.filter((link) => link.labelKey !== 'workshop');

export default function Home() {
  const t = useTranslations();
  const auth = useAuth();

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <section className="py-6 text-center">
        <h1 className="title-primary">{t('home.title')}</h1>
      </section>

      {auth.status === 'authenticated' ? <PlayerSummary uid={auth.uid} /> : <LoginBanner />}

      <WorkshopCard />

      <PageCards />

      <LaunchCard />

      <section className="grid gap-6 md:grid-cols-2">
        <Link href="/feedback" className="block card-container card-pad card-hover">
          <h2 className="title-secondary mb-2">{t('home.feedback.title')}</h2>
          <p className="text-content">{t('home.feedback.description')}</p>
        </Link>
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
