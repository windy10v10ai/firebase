'use client';

import { useTranslations } from 'next-intl';

import { EXTERNAL_LINKS } from '@/config/links';

import Card from './components/Card';
import LoginBanner from './home/LoginBanner';
import PageCards from './home/PageCards';
import PlayerSummary from './home/PlayerSummary';
import { useAuth } from './lib/auth';

export default function Home() {
  const t = useTranslations();
  const auth = useAuth();

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <section className="py-6 text-center">
        <h1 className="title-primary">{t('home.title')}</h1>
      </section>

      {auth.status === 'authenticated' ? <PlayerSummary uid={auth.uid} /> : <LoginBanner />}

      <PageCards />

      <section className="space-y-6">
        {EXTERNAL_LINKS.map((link) => (
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
