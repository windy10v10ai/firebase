"use client";

import React from 'react';
import {useTranslations} from 'next-intl';
import Card from './components/Card';
import Section from './components/Section';
import ProductDisplay from './components/ProductDisplay';

export default function Home() {
  const t = useTranslations();

  return (
    <div className="space-y-8">
      {/* 欢迎区域 */}
      <section className="text-center py-6">
        <h1 className="title-primary">{t('home.title')}</h1>
      </section>

      {/* 会员订阅 */}
      <ProductDisplay
        title={t('home.membership.title')}
        description={t('home.membership.description')}
        benefits={t.raw('home.membership.benefits')}
        subscribeText={t('home.membership.subscribe')}
        subscribeLink={t('home.membership.subscribeLink')}
        imagePath="/images/membership.png"
        note={t('home.membership.note')}
      />

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
