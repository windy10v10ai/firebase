'use client';

import { ChevronRight, ThumbsUp, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import Skeleton from '@/app/components/ui/skeleton';
import { memberStatusKey, type PlayerInfo } from '@/app/lib/player-info';

/** 身份卡：ID 取自地址，数据没到也能先显示；会员状态只做陈述，订阅入口是底部的文字链接 */
export default function PlayerCard({ steamId, info }: { steamId: string; info: PlayerInfo | null }) {
  const t = useTranslations('profile.identity');
  const tMember = useTranslations('profile.member');
  const member = info?.member;

  return (
    <section className="card-container card-pad flex flex-col justify-between gap-5">
      <div className="flex items-center gap-4">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-full border border-line bg-panel-soft">
          <UserRound className="size-7 text-muted" strokeWidth={1.7} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold text-heading md:text-[26px]">
            {t('heading', { id: steamId })}
          </h1>
          {/* 两行始终占位且不折行：非会员本来就空着，放骨架会预告不存在的内容，会员信息晚到也不撑高卡片 */}
          <p className="flex flex-col">
            {/* 金色代表会员有效，过期了照样上金会让人以为还在生效 */}
            <span
              className={`min-h-6 truncate ${member?.enable ? 'font-medium text-member-strong' : 'text-muted'}`}
            >
              {member ? tMember(memberStatusKey(member)) : null}
            </span>
            <span className="min-h-5 truncate text-sm text-muted">
              {member
                ? tMember(member.enable ? 'expireDate' : 'expiredDate', { date: member.expireDateString })
                : null}
            </span>
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-line pt-4">
        <div className="flex items-center gap-1.5 text-content" title={t('conductNet')}>
          <ThumbsUp className="size-4 text-success" aria-hidden="true" />
          <span className="font-medium tabular-nums">
            {info ? info.commendCount - info.reportCount : <Skeleton />}
          </span>
          <span className="sr-only">{t('conductNet')}</span>
        </div>
        <Link
          href="/membership"
          className="inline-flex items-center gap-1 text-sm whitespace-nowrap text-link transition-colors hover:text-link-hover"
        >
          {tMember('link')}
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
