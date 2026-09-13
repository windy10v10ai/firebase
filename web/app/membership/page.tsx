'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import React from 'react';

import { MEMBERSHIP_AFDIAN_LINK, MEMBERSHIP_KOFI_LINK } from '@/config/links';

import Section from '../components/Section';

import PlatformCard from './PlatformCard';

// emoji 的字形画得比排版宽度宽，紧跟其后的汉字会被压住，所以让 emoji 单独占一列
const LEADING_EMOJI = /^(\p{Extended_Pictographic}\uFE0F?)\s*/u;

function splitLeadingEmoji(text: string): [string | null, string] {
  const matched = text.match(LEADING_EMOJI);
  return matched ? [matched[1]!, text.slice(matched[0].length)] : [null, text];
}

const MANUAL_ACTIVE_LINKS = [
  {
    href: '/regist/afdian',
    labelKey: 'membership.manualActive.afdian',
    colorClass: 'text-afdian hover:brightness-110',
  },
  {
    href: '/regist/kofi',
    labelKey: 'membership.manualActive.kofi',
    colorClass: 'text-kofi hover:brightness-110',
  },
];

function EmojiLead({ text }: { text: string }) {
  const [emoji, rest] = splitLeadingEmoji(text);
  if (!emoji) {
    return <>{text}</>;
  }
  return (
    <>
      <span aria-hidden="true" className="mr-1.5">
        {emoji}
      </span>
      {rest}
    </>
  );
}

export default function MembershipPage() {
  const t = useTranslations();

  return (
    <div className="space-y-8">
      <Section title={t('membership.title')} titleClassName="text-member-strong">
        <div className="space-y-6">
          <p className="text-content text-lg text-center">
            <EmojiLead text={t('membership.description')} />
          </p>

          <ul className="space-y-3">
            {t.raw('membership.benefits').map((benefit: string, index: number) => {
              const [emoji, rest] = splitLeadingEmoji(benefit);
              return (
                <li key={index} className="flex items-start gap-2 text-content">
                  <span aria-hidden="true" className="w-6 shrink-0 text-center">
                    {emoji}
                  </span>
                  <span className="flex-1">{rest}</span>
                </li>
              );
            })}
          </ul>

          <p className="text-muted text-sm text-center">
            <EmojiLead text={t('membership.note')} />
          </p>
        </div>
      </Section>

      <div className="grid gap-6 sm:grid-cols-2 max-w-2xl mx-auto">
        <PlatformCard
          title={t('membership.afdian.title')}
          price={t('membership.afdian.price')}
          subscribeText={t('membership.afdian.subscribe')}
          href={MEMBERSHIP_AFDIAN_LINK}
          titleClassName="text-afdian"
          buttonClassName="btn-afdian"
        />
        <PlatformCard
          title={t('membership.kofi.title')}
          price={t('membership.kofi.price')}
          subscribeText={t('membership.kofi.subscribe')}
          href={MEMBERSHIP_KOFI_LINK}
          titleClassName="text-kofi"
          buttonClassName="btn-kofi"
        />
      </div>

      <p className="text-muted text-sm text-center">
        {t('membership.manualActive.prompt')}
        {MANUAL_ACTIVE_LINKS.map((link, index) => (
          <React.Fragment key={link.href}>
            {index > 0 ? <span className="mx-1">/</span> : ' '}
            <Link
              href={link.href}
              className={`inline-block py-1 transition-[filter] ${link.colorClass}`}
            >
              {t(link.labelKey)}
            </Link>
          </React.Fragment>
        ))}
      </p>
    </div>
  );
}
