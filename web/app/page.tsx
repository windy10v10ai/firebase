"use client";

import React from 'react';
import {useTranslations} from 'next-intl';
import Card from './components/Card';
import Section from './components/Section';

export default function Home() {
  const t = useTranslations();

  return (
    <div className="space-y-12">
      {/* 欢迎区域 */}
      <section className="text-center py-12">
        <h1 className="title-primary mb-4">{t('home.title')}</h1>
      </section>

      {/* 会员订阅 */}
      <Section title={t('home.membership.title')}>
        <div className="max-w-2xl mx-auto space-y-6">
          <p className="text-content text-center whitespace-pre-line">
            {t('home.membership.description')}
          </p>
          
          <ul className="list-disc list-inside space-y-2 text-content">
            {t.raw('home.membership.benefits').map((benefit: string, index: number) => (
              <li key={index}>{benefit}</li>
            ))}
          </ul>

          <div className="text-center pt-4">
            <a 
              href={t('home.membership.subscribeLink')}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary"
            >
              {t('home.membership.subscribe')}
            </a>
          </div>
        </div>
      </Section>

      {/* 链接区域 */}
      <section className="max-w-2xl mx-auto">
        <div className="space-y-6">
          <Card 
            href="https://steamcommunity.com/sharedfiles/filedetails/?id=2307479570"
            title={t('home.steamWorkshop.title')}
            description={t('home.steamWorkshop.description')}
          />

          <Card 
            href="https://github.com/windy10v10ai/game"
            title={t('home.github.title')}
            description={t('home.github.description')}
          />
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
