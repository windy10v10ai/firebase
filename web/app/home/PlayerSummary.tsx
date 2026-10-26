'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import CheckInRow from '@/app/components/CheckInRow';
import IdWithCopy from '@/app/components/IdWithCopy';
import PlayerAvatar from '@/app/components/PlayerAvatar';
import { memberStatusKey } from '@/app/lib/player-info';
import { playerPagePath } from '@/app/lib/player-path';
import { applyPlayerWrite, playerInfoQuery } from '@/app/lib/queries';
import { useSteamProfile } from '@/app/lib/use-steam-profile';

import LevelTile from './LevelTile';

/** 首屏右侧面板（已登录）：身份、两套等级与积分、签到 */
export default function PlayerSummary({ uid }: { uid: string }) {
  const t = useTranslations('home.summary');
  const queryClient = useQueryClient();
  const infoQuery = useQuery(playerInfoQuery(uid));
  const info = infoQuery.data ?? null;
  // 面板结构始终不变，失败时数值显示为横线，高度不随请求结果变化
  const failed = !info && infoQuery.isError;
  const profile = useSteamProfile(uid);

  const member = info?.member;
  const status = memberStatusKey(member);
  const idText = t('heading', { id: uid });
  const personaName = profile?.personaName ?? null;
  const profilePath = playerPagePath(uid);

  const seasonValues = info
    ? {
        level: info.seasonLevel,
        currentLevelPoint: info.seasonCurrrentLevelPoint,
        nextLevelPoint: info.seasonNextLevelPoint,
        usablePoint: info.useableSeasonPoint ?? 0,
      }
    : null;
  const memberValues = info
    ? {
        level: info.memberLevel,
        currentLevelPoint: info.memberCurrentLevelPoint,
        nextLevelPoint: info.memberNextLevelPoint,
        usablePoint: info.useableMemberPoint ?? 0,
      }
    : null;

  return (
    <section className="hero-panel card-pad">
      <div className="flex items-center gap-3.5">
        <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-hero-panel-border bg-glass md:size-14">
          <PlayerAvatar
            avatarUrl={profile?.avatarUrl}
            imageClassName="size-12 object-cover md:size-14"
            iconClassName="size-6 text-muted md:size-7"
            iconStrokeWidth={1.7}
          />
        </span>
        <div className="min-w-0 flex-1">
          {/* 昵称来自接口数据，不用标题字体 */}
          <p className="flex min-w-0 items-center text-xl font-bold text-heading md:text-2xl">
            {personaName ? (
              <span className="min-w-0 truncate">{personaName}</span>
            ) : (
              <IdWithCopy
                id={uid}
                idText={idText}
                copyTooltip={t('copyId.tooltip')}
                copiedLabel={t('copyId.copied')}
              />
            )}
          </p>
          {/* 昵称没取到时标题本身就是 ID，这一行空着；高度照留，写法同 profile 页身份卡 */}
          <p className="min-h-5 min-w-0 truncate text-[13px] text-muted">
            {personaName ? (
              <IdWithCopy
                id={uid}
                idText={idText}
                copyTooltip={t('copyId.tooltip')}
                copiedLabel={t('copyId.copied')}
              />
            ) : null}
          </p>
          {/* 会员状态只做陈述，订阅入口在下面的会员卡和会员页；状态与有效期各占一行、始终占位，会员信息晚到也不撑高身份行，非会员本来就空着，放骨架会预告不存在的内容 */}
          <p className="flex flex-col">
            {/* 金色代表会员有效，过期了照样上金会让人以为还在生效 */}
            <span
              className={`min-h-6 truncate ${member?.enable ? 'font-medium text-member-strong' : 'text-muted'}`}
            >
              {member ? t(`member.${status}`) : null}
            </span>
            <span className="min-h-5 text-sm text-muted">
              {member ? t('member.expireDate', { date: member.expireDateString ?? '' }) : null}
            </span>
          </p>
        </div>
        <Link
          href={profilePath}
          className="btn-glass hidden h-10 gap-1 px-3.5 text-sm md:inline-flex"
        >
          {t('profileLink')}
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2.5" aria-busy={!info && !failed}>
        <LevelTile tone="season" label={t('battleLevel')} values={seasonValues} failed={failed} />
        <LevelTile tone="member" label={t('memberLevel')} values={memberValues} failed={failed} />
      </div>

      <CheckInRow
        info={info}
        steamId={uid}
        buttonVariant="cta"
        onClaimed={(player) => {
          void applyPlayerWrite(queryClient, uid, playerInfoQuery(uid).queryKey, player);
        }}
      />

      <Link href={profilePath} className="btn-glass h-11 gap-1 text-sm md:hidden">
        {t('profileLink')}
        <ChevronRight className="size-4" aria-hidden="true" />
      </Link>
    </section>
  );
}
