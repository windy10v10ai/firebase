'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, CirclePlus, Sparkles, Trophy } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import LoginPanel from '@/app/components/LoginPanel';
import Notice from '@/app/components/Notice';
import Skeleton from '@/app/components/ui/skeleton';
import { ApiError } from '@/app/lib/api';
import { useAuth } from '@/app/lib/auth';
import { formatBattleRank } from '@/app/lib/leaderboard';
import { playerPagePath } from '@/app/lib/player-path';
import { applyPlayerWrite, battleRankQuery, playerInfoQuery } from '@/app/lib/queries';
import { useSteamProfile } from '@/app/lib/use-steam-profile';
import { AWAKEN_HERO_COUNT } from '@/config/awaken';

import FeatureEntryCard from './FeatureEntryCard';
import LevelCard from './LevelCard';
import PlayerCard from './PlayerCard';
import RadarCard from './RadarCard';
import RecentMatchesCard from './RecentMatchesCard';
import StatsCard from './StatsCard';

const FAILURE_KEY: Record<number, string> = {
  403: 'private',
  404: 'noRecord',
};

export default function ProfilePage() {
  const t = useTranslations('profile');
  const { steamId } = useParams<{ steamId: string }>();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const infoQuery = useQuery(playerInfoQuery(steamId));
  // 昵称头像与名次各自单独请求：一个要向 Steam 取数，一个要在库里数人数，快慢都不该拖住整页
  const profile = useSteamProfile(steamId);
  const rankQuery = useQuery(battleRankQuery(steamId));

  // 个人主页能看别人的，签到入口只给本人
  const isSelf = auth.status === 'authenticated' && auth.uid === steamId;
  const info = infoQuery.data ?? null;

  if (!info && infoQuery.isError) {
    const httpStatus = infoQuery.error instanceof ApiError ? infoQuery.error.status : 0;
    // 页面不判断登录，看得到看不到由接口说了算
    if (httpStatus === 401) {
      return <LoginPanel />;
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
        onCheckInClaimed={
          isSelf
            ? (player) => {
                void applyPlayerWrite(queryClient, steamId, playerInfoQuery(steamId).queryKey, player);
              }
            : undefined
        }
      />
      <div className="grid min-w-0 content-start gap-6 lg:col-span-2">
        <LevelCard info={info} />
        <div className="grid min-w-0 gap-2 md:grid-cols-2 md:gap-4">
          <FeatureEntryCard
            tone="property"
            Icon={CirclePlus}
            title={t('entries.property.title')}
            badge={
              info ? (
                t('entries.property.badge', { count: info.useableLevel })
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
          {/* 不给这张卡加标签：轮次要多发一次每日任务的请求，而那条 GET 会写库 */}
          <FeatureEntryCard
            tone="dailyTask"
            Icon={CalendarCheck}
            title={t('entries.dailyTask.title')}
            href={playerPagePath(steamId, 'daily-task')}
          />
          <FeatureEntryCard
            tone="leaderboard"
            Icon={Trophy}
            title={t('entries.leaderboard.title')}
            badge={
              rankQuery.data !== undefined ? (
                t('entries.leaderboard.badge', { rank: formatBattleRank(rankQuery.data) })
              ) : rankQuery.isError ? undefined : (
                <Skeleton>{t('entries.leaderboard.badge', { rank: '000' })}</Skeleton>
              )
            }
            href="/leaderboard"
          />
        </div>
      </div>
      <RadarCard steamId={steamId} />
      <div className="min-w-0 lg:col-span-2">
        <StatsCard info={info} />
      </div>
      <div className="lg:col-span-3">
        {/* 自己发一次请求：满员 50 场约 50 KB，挂在首屏那次请求上会拖慢整页 */}
        <RecentMatchesCard steamId={steamId} />
      </div>
    </div>
  );
}
