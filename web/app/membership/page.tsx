'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import React from 'react';

import { MEMBERSHIP_AFDIAN_LINK, MEMBERSHIP_KOFI_LINK } from '@/config/links';

import Section from '../components/Section';

import PlatformCard from './PlatformCard';

const MANUAL_ACTIVE_LINKS = [
  { href: '/regist/afdian', labelKey: 'membership.manualActive.afdian' },
  { href: '/regist/kofi', labelKey: 'membership.manualActive.kofi' },
];

export default function MembershipPage() {
  const t = useTranslations();

  return (
    <div className="space-y-8">
      <Section title={t('membership.title')}>
        <div className="space-y-6">
          <p className="text-content text-lg text-center">{t('membership.description')}</p>

          <ul className="space-y-3">
            {t.raw('membership.benefits').map((benefit: string, index: number) => (
              <li key={index} className="flex items-start text-content">
                <span>{benefit}</span>
              </li>
            ))}
          </ul>

          <p className="text-muted text-sm text-center">{t('membership.note')}</p>
        </div>
      </Section>

      <div className="grid gap-6 sm:grid-cols-2 max-w-2xl mx-auto">
        <PlatformCard
          title={t('membership.afdian.title')}
          price={t('membership.afdian.price')}
          subscribeText={t('membership.afdian.subscribe')}
          href={MEMBERSHIP_AFDIAN_LINK}
        />
        <PlatformCard
          title={t('membership.kofi.title')}
          price={t('membership.kofi.price')}
          subscribeText={t('membership.kofi.subscribe')}
          href={MEMBERSHIP_KOFI_LINK}
        />
      </div>

      <p className="text-muted text-sm text-center">
        {t('membership.manualActive.prompt')}
        {MANUAL_ACTIVE_LINKS.map((link, index) => (
          <React.Fragment key={link.href}>
            {index > 0 ? <span className="mx-1">/</span> : ' '}
            <Link href={link.href} className="inline-block py-1 text-accent hover:text-accent-hover">
              {t(link.labelKey)}
            </Link>
          </React.Fragment>
        ))}
      </p>
    </div>
  );
}
