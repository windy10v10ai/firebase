'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, Check, ChartNoAxesColumn, Sparkles, Trophy } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import LoginPanel from '@/app/components/LoginPanel';
import Notice from '@/app/components/Notice';
import PrivateProfileNotice from '@/app/components/PrivateProfileNotice';
import Skeleton from '@/app/components/ui/skeleton';
import { ApiError } from '@/app/lib/api';
import { useIsSelf } from '@/app/lib/auth';
import { formatBattleRank } from '@/app/lib/leaderboard';
import { playerPagePath } from '@/app/lib/player-path';
import {
  applyPlayerWrite,
  battleRankQuery,
  dailyTaskPreviewQuery,
  playerInfoQuery,
} from '@/app/lib/queries';
import { useSteamProfile } from '@/app/lib/use-steam-profile';
import { AWAKEN_HERO_COUNT } from '@/config/awaken';
import { ROUNDS_PER_DAY } from '@/config/daily-task';

import FeatureEntryCard from './FeatureEntryCard';
import LevelCard from './LevelCard';
import PlayerCard from './PlayerCard';
import RadarCard from './RadarCard';
import RecentMatchesCard from './RecentMatchesCard';
import StatsCard from './StatsCard';

const FAILURE_KEY: Record<number, string> = {
  404: 'noRecord',
};

export default function ProfilePage() {
  const t = useTranslations('profile');
  const { steamId } = useParams<{ steamId: string }>();
  // 本人版与访客版的结构差异只看这一个值，首屏就由提示 cookie 定下，不等接口返回
  const isSelf = useIsSelf(steamId);
  const queryClient = useQueryClient();
  const infoQuery = useQuery(playerInfoQuery(steamId));
  // 昵称头像与名次各自单独请求：一个要向 Steam 取数，一个要在库里数人数，快慢都不该拖住整页
  const profile = useSteamProfile(steamId);
  const rankQuery = useQuery(battleRankQuery(steamId));
  // 每日任务不对别人开放，它的读取还会替玩家生成当天任务
  const dailyTaskQuery = useQuery({ ...dailyTaskPreviewQuery(steamId), enabled: isSelf });
  const info = infoQuery.data ?? null;
  const rankBadge =
    rankQuery.data !== undefined ? (
      t('entries.leaderboard.badge', { rank: formatBattleRank(rankQuery.data) })
    ) : rankQuery.isError ? undefined : (
      <Skeleton>{t('entries.leaderboard.badge', { rank: '000' })}</Skeleton>
    );

  const dailyTaskBadge = (done: number) => {
    const text = t('entries.dailyTask.badge', { done, total: ROUNDS_PER_DAY });
    return done < ROUNDS_PER_DAY ? (
      text
    ) : (
      <span className="inline-flex items-center gap-1 text-success">
        <Check className="size-3.5 shrink-0" aria-hidden="true" />
        {text}
      </span>
    );
  };

  if (!info && infoQuery.isError) {
    const httpStatus = infoQuery.error instanceof ApiError ? infoQuery.error.status : 0;
    // 页面不判断登录，看得到看不到由接口说了算
    if (httpStatus === 401) {
      return <LoginPanel />;
    }
    if (httpStatus === 403) {
      return <PrivateProfileNotice />;
    }
    const key = FAILURE_KEY[httpStatus] ?? 'failed';
    return (
      <Notice title={t(`${key}.title`)}>
        <p className="text-content">{t(`${key}.description`)}</p>
      </Notice>
    );
  }

  return (
    // 电脑宽度左栏放身份卡、右栏放等级卡与入口卡；下一行六边形图在左、战绩在右，近期战绩通栏；更窄时按 DOM 顺序单列，入口卡从平板起两张一行
    <div className="grid gap-6 lg:grid-cols-3" aria-busy={!info}>
      {info ? null : (
        <p role="status" className="sr-only">
          {t('loading')}
        </p>
      )}
      <PlayerCard
        steamId={steamId}
        info={info}
        profile={profile}
        isSelf={isSelf}
        rankBadge={rankBadge}
        onCheckInClaimed={(player) => {
          void applyPlayerWrite(queryClient, steamId, playerInfoQuery(steamId).queryKey, player);
        }}
      />
      <div className="grid min-w-0 content-start gap-6 lg:col-span-2">
        <LevelCard info={info} isSelf={isSelf} />
        <div className="grid min-w-0 gap-2 md:grid-cols-2 md:gap-4">
          <FeatureEntryCard
            tone="property"
            Icon={ChartNoAxesColumn}
            title={t('entries.property.title')}
            badge={
              info && !isSelf ? (
                t('entries.property.badgeOthers', { count: info.usedLevel ?? 0 })
              ) : info ? (
                info.useableLevel > 0 ? (
                  t('entries.property.badge', { count: info.useableLevel })
                ) : (
                  <span className="text-muted">{t('entries.property.badgeDone')}</span>
                )
              ) : (
                <Skeleton>{t('entries.property.badge', { count: 0 })}</Skeleton>
              )
            }
            href={playerPagePath(steamId, 'property')}
          />
          <FeatureEntryCard
            tone="awaken"
            Icon={Sparkles}
            title={t('entries.awaken.title')}
            badge={
              info ? (
                t('entries.awaken.badge', {
                  awakened: info.awakenedHeroes?.length ?? 0,
                  total: AWAKEN_HERO_COUNT,
                })
              ) : (
                <Skeleton>
                  {t('entries.awaken.badge', { awakened: 0, total: AWAKEN_HERO_COUNT })}
                </Skeleton>
              )
            }
            href={playerPagePath(steamId, 'awaken')}
          />
          {isSelf ? (
            <FeatureEntryCard
              tone="dailyTask"
              Icon={CalendarCheck}
              title={t('entries.dailyTask.title')}
              badge={
                dailyTaskQuery.data ? (
                  dailyTaskBadge(
                    Math.min(dailyTaskQuery.data.completedTasks.length, ROUNDS_PER_DAY),
                  )
                ) : dailyTaskQuery.isError ? undefined : (
                  <Skeleton>
                    {t('entries.dailyTask.badge', { done: 0, total: ROUNDS_PER_DAY })}
                  </Skeleton>
                )
              }
              href={playerPagePath(steamId, 'daily-task')}
            />
          ) : null}
          {/* 别人看时名次并进身份卡，入口卡只剩两张，正好排满一行 */}
          {isSelf ? (
            <FeatureEntryCard
              tone="leaderboard"
              Icon={Trophy}
              title={t('entries.leaderboard.title')}
              badge={rankBadge}
              href="/leaderboard"
            />
          ) : null}
        </div>
      </div>
      <RadarCard steamId={steamId} />
      <div className="min-w-0 lg:col-span-2">
        <StatsCard info={info} showConduct={isSelf} />
      </div>
      {/* 一串连续的对局会暴露玩家什么时候在玩，只给本人看 */}
      {isSelf ? (
        <div className="lg:col-span-3">
          {/* 自己发一次请求：满员 50 场约 50 KB，挂在首屏那次请求上会拖慢整页 */}
          <RecentMatchesCard steamId={steamId} />
        </div>
      ) : null}
    </div>
  );
}
