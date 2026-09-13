'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { MEMBER_LEVEL_PREMIUM, type MemberInfo } from '@/app/lib/player-info';

function statusKey(member?: MemberInfo): string {
  if (!member) {
    return 'none';
  }
  if (!member.enable) {
    return 'expired';
  }
  return member.level >= MEMBER_LEVEL_PREMIUM ? 'premium' : 'normal';
}

export default function MemberCard({ member }: { member?: MemberInfo }) {
  const t = useTranslations('profile.member');

  return (
    <section className="card-container space-y-4 p-6 sm:p-8">
      <h2 className="title-secondary text-member-strong">{t('title')}</h2>
      <p className="text-lg text-content">{t(statusKey(member))}</p>
      {member ? (
        <p className="text-muted">
          {t(member.enable ? 'expireDate' : 'expiredDate', { date: member.expireDateString })}
        </p>
      ) : null}
      <Link
        href="/membership"
        className="btn-member"
      >
        {t('subscribe')}
      </Link>
    </section>
  );
}
