'use client';

import { ChevronRight, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { fetchPlayerInfo, memberStatusKey, type PlayerInfo } from '@/app/lib/player-info';
import { playerPagePath } from '@/app/lib/player-path';

function StatRow({ label, value, className }: { label: string; value: string; className: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-2">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className={`font-medium ${className}`}>{value}</dd>
    </div>
  );
}

export default function PlayerSummary({ uid }: { uid: string }) {
  const t = useTranslations('home.summary');
  const [info, setInfo] = useState<PlayerInfo | null>(null);

  // 首页不为这次请求挡着渲染：数值到了再补上，失败就只留身份行
  useEffect(() => {
    let cancelled = false;
    fetchPlayerInfo(uid)
      .then((loaded) => {
        if (!cancelled) {
          setInfo(loaded);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const member = info?.member;
  const status = memberStatusKey(member);

  return (
    <section className="card-container space-y-5 p-6 sm:p-8">
      <div className="flex items-center gap-4">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-full border border-line bg-panel-soft">
          <UserRound className="size-7 text-muted" strokeWidth={1.7} aria-hidden="true" />
        </span>
        <div className="flex-1">
          <p className="text-2xl font-bold text-heading sm:text-[26px]">
            {t('heading', { id: uid })}
          </p>
          {/* 会员状态只做陈述，订阅入口在下面的会员卡和会员页，同屏不放第三个 */}
          {member?.enable ? (
            <p className="flex flex-wrap items-baseline gap-x-2">
              {/* 金色代表会员有效，过期了照样上金会让人以为还在生效 */}
              <span className="font-medium text-member-strong">{t(`member.${status}`)}</span>
              <span className="text-sm text-muted">
                {t('member.expireDate', { date: member.expireDateString })}
              </span>
            </p>
          ) : null}
          {/* 没开通过不说话：一行「未开通会员」既没信息也没去处 */}
          {member && !member.enable ? (
            <p className="text-sm text-muted">
              {t('member.expiredDate', { date: member.expireDateString })}
            </p>
          ) : null}
        </div>
        <Link
          href={playerPagePath(uid)}
          className="link-inline inline-flex items-center gap-1 text-sm whitespace-nowrap"
        >
          {t('profileLink')}
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </div>

      {info ? (
        <dl className="grid gap-x-8 sm:grid-cols-2">
          <StatRow
            label={t('battleLevel')}
            value={String(info.seasonLevel)}
            className="text-season"
          />
          <StatRow
            label={t('memberLevel')}
            value={String(info.memberLevel)}
            className="text-member"
          />
          <StatRow
            label={t('battlePoint')}
            value={info.useableSeasonPoint.toLocaleString()}
            className="text-season"
          />
          <StatRow
            label={t('memberPoint')}
            value={info.useableMemberPoint.toLocaleString()}
            className="text-member"
          />
        </dl>
      ) : null}
    </section>
  );
}
