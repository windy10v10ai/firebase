'use client';

import { useTranslations } from 'next-intl';

import { EXTERNAL_LINKS } from '@/config/links';

import Card from './components/Card';
import Section from './components/Section';

export default function Home() {
  const t = useTranslations();

  return (
    <div className="space-y-8">
      {/* 欢迎区域 */}
      <section className="text-center py-6">
        <h1 className="title-primary">{t('home.title')}</h1>
      </section>

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
