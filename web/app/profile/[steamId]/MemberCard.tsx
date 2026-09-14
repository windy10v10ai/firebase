'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import Skeleton from '@/app/components/ui/skeleton';
import { MEMBER_LEVEL_PREMIUM, type MemberInfo, type PlayerInfo } from '@/app/lib/player-info';

function statusKey(member?: MemberInfo): string {
  if (!member) {
    return 'none';
  }
  if (!member.enable) {
    return 'expired';
  }
  return member.level >= MEMBER_LEVEL_PREMIUM ? 'premium' : 'normal';
}

export default function MemberCard({ info }: { info: PlayerInfo | null }) {
  const t = useTranslations('profile.member');
  const member = info?.member;

  return (
    <section className="card-container card-pad space-y-4">
      <h2 className="title-secondary text-member-strong">{t('title')}</h2>
      <p className="text-lg text-content">{info ? t(statusKey(member)) : <Skeleton>{t('none')}</Skeleton>}</p>
      {/* 非会员没有有效期，这一行可能本来就空，只留位不放骨架 */}
      <p className="min-h-6 text-muted">
        {member ? t(member.enable ? 'expireDate' : 'expiredDate', { date: member.expireDateString }) : null}
      </p>
      <Link
        href="/membership"
        className="btn-member"
      >
        {t('subscribe')}
      </Link>
    </section>
  );
}
