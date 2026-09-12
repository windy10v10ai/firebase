'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import React from 'react';

import { EXTERNAL_LINKS } from '@/config/links';

import Card from './components/Card';
import ProductDisplay from './components/ProductDisplay';
import Section from './components/Section';

const MANUAL_ACTIVE_LINKS = [
  { href: '/regist/afdian', labelKey: 'home.manualActive.afdian' },
  { href: '/regist/kofi', labelKey: 'home.manualActive.kofi' },
];

export default function Home() {
  const t = useTranslations();

  return (
    <div className="space-y-8">
      {/* 欢迎区域 */}
      <section className="text-center py-6">
        <h1 className="title-primary">{t('home.title')}</h1>
      </section>

      {/* 会员订阅 */}
      <div className="space-y-3">
        <ProductDisplay
          title={t('home.membership.title')}
          description={t('home.membership.description')}
          benefits={t.raw('home.membership.benefits')}
          subscribeText={t('home.membership.subscribe')}
          subscribeLink={t('home.membership.subscribeLink')}
          imagePath="/images/membership.png"
          note={t('home.membership.note')}
        />

        <p className="text-muted text-sm text-center">
          {t('home.manualActive.prompt')}
          {MANUAL_ACTIVE_LINKS.map((link, index) => (
            <React.Fragment key={link.href}>
              {index > 0 ? <span className="mx-1">/</span> : ' '}
              <Link
                href={link.href}
                className="inline-block py-1 text-accent hover:text-accent-hover"
              >
                {t(link.labelKey)}
              </Link>
            </React.Fragment>
          ))}
        </p>
      </div>

      {/* 链接区域 */}
      <section className="max-w-2xl mx-auto">
        <div className="space-y-6">
          {EXTERNAL_LINKS.map((link) => (
            <Card
              key={link.href}
              href={link.href}
              title={t(`home.${link.labelKey}.title`)}
              description={t(`home.${link.labelKey}.description`)}
            />
          ))}
        </div>
      </section>

      {/* 项目介绍 */}
      <Section title={t('home.about.title')}>
        <p className="text-content text-center whitespace-pre-line">
          {t('home.about.description')}
        </p>
      </Section>
    </div>
  );
}
