'use client';

import { ChevronRight, ThumbsUp } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import IdWithCopy from '@/app/components/IdWithCopy';
import PlayerAvatar from '@/app/components/PlayerAvatar';
import Skeleton from '@/app/components/ui/skeleton';
import { memberStatusKey, type PlayerInfo } from '@/app/lib/player-info';
import { type SteamProfile } from '@/app/lib/steam-profile';

/** 身份卡：ID 取自地址，数据没到也能先显示；会员状态只做陈述，订阅入口是底部的文字链接 */
export default function PlayerCard({
  steamId,
  info,
  profile,
}: {
  steamId: string;
  info: PlayerInfo | null;
  profile: SteamProfile | null;
}) {
  const t = useTranslations('profile.identity');
  const tMember = useTranslations('profile.member');
  const member = info?.member;
  const idText = t('heading', { id: steamId });
  const personaName = profile?.personaName ?? null;
  // 金色代表会员有效，过期了照样上金会让人以为还在生效
  const statusClass = member?.enable ? 'font-medium text-member-strong' : 'text-muted';
  // 并成一行的那一档放不下完整写法，单独取一套短文案，做法与头部品牌名的 home / homeShort 一致
  const statusText = (short: boolean) => {
    if (!member) {
      return null;
    }
    const key = memberStatusKey(member);
    // 三档里只有高级会员的英文写法长到那一行装不下
    return tMember(short && key === 'premium' ? 'premiumShort' : key);
  };
  const dateText = (short: boolean) => {
    if (!member) {
      return null;
    }
    // 过期态的状态词已经说明了含义，日期不再配前缀
    if (!member.enable) {
      return member.expireDateString;
    }
    return tMember(short ? 'expireDateShort' : 'expireDate', { date: member.expireDateString });
  };

  return (
    // 网格项默认 min-width:auto，昵称不换行会把整列撑宽，truncate 也就永远轮不到生效
    <section className="card-container card-pad flex min-w-0 flex-col justify-between gap-5">
      <div className="flex items-center gap-4">
        <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-panel-soft">
          <PlayerAvatar
            avatarUrl={profile?.avatarUrl}
            imageClassName="size-14 object-cover"
            iconClassName="size-7 text-muted"
            iconStrokeWidth={1.7}
          />
        </span>
        <div className="min-w-0 flex-1 flex flex-col">
          <h1 className="flex min-w-0 items-center text-2xl font-bold text-heading md:text-[26px]">
            {personaName ? (
              <span className="min-w-0 truncate">{personaName}</span>
            ) : (
              <IdWithCopy
                id={steamId}
                idText={idText}
                copyTooltip={t('copyId.tooltip')}
                copiedLabel={t('copyId.copied')}
              />
            )}
          </h1>
          {/* 昵称没取到时标题本身就是 ID，这一行空着；高度照留，两种情况卡片一样高 */}
          <span className="min-h-5 min-w-0 truncate text-sm text-muted">
            {personaName ? (
              <IdWithCopy
                id={steamId}
                idText={idText}
                copyTooltip={t('copyId.tooltip')}
                copiedLabel={t('copyId.copied')}
              />
            ) : null}
          </span>
          {/*
            电脑档身份卡只占三栏里的一栏，文字列仅 177px，装不下「状态 + 有效期」一行，所以拆成两行；
            手机与平板的卡是通栏的，并成一行能省下一行高度，空出的位置正好给上面的 ID。
            非会员时两种形态都整行留空，放骨架会预告不存在的内容。
          */}
          <span className="mt-1 flex min-h-6 items-baseline gap-2 lg:hidden">
            {member ? (
              <>
                <span className={`shrink-0 ${statusClass}`}>{statusText(true)}</span>
                <span className="truncate text-sm text-muted">{dateText(true)}</span>
              </>
            ) : null}
          </span>
          <span className={`mt-1 hidden min-h-6 truncate lg:block ${statusClass}`}>
            {statusText(false)}
          </span>
          <span className="hidden min-h-5 truncate text-sm text-muted lg:block">
            {dateText(false)}
          </span>
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
