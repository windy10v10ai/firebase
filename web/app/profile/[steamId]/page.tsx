'use client';

import { CalendarCheck, CirclePlus, Sparkles, Trophy } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import LoginPanel from '@/app/components/LoginPanel';
import Notice from '@/app/components/Notice';
import Skeleton from '@/app/components/ui/skeleton';
import { ApiError } from '@/app/lib/api';
import { useAuth } from '@/app/lib/auth';
import { fetchBattleRank, formatBattleRank } from '@/app/lib/leaderboard';
import { fetchPlayerInfo, type PlayerInfo } from '@/app/lib/player-info';
import { playerPagePath } from '@/app/lib/player-path';
import { fetchSteamProfile, type SteamProfile } from '@/app/lib/steam-profile';
import { AWAKEN_HERO_COUNT } from '@/config/awaken';

import FeatureEntryCard from './FeatureEntryCard';
import LevelCard from './LevelCard';
import PlayerCard from './PlayerCard';
import RecentMatchesCard from './RecentMatchesCard';
import StatsCard from './StatsCard';

// 带上请求时用的 steamId，换一个玩家时旧结果立刻失效，不用先手动置回加载中
type LoadResult =
  | { steamId: string; status: 'failed'; httpStatus: number }
  | { steamId: string; status: 'ready'; info: PlayerInfo };

type RankResult = { steamId: string; rank: number | null } | { steamId: string; failed: true };

const FAILURE_KEY: Record<number, string> = {
  403: 'private',
  404: 'noRecord',
};

export default function ProfilePage() {
  const t = useTranslations('profile');
  const { steamId } = useParams<{ steamId: string }>();
  const auth = useAuth();
  const { initialProfile } = auth;
  const [result, setResult] = useState<LoadResult | null>(null);
  const [steamProfile, setSteamProfile] = useState<SteamProfile | null>(() => initialProfile);
  const [rankResult, setRankResult] = useState<RankResult | null>(null);

  // 个人主页能看别人的，签到入口只给本人
  const isSelf = auth.status === 'authenticated' && auth.uid === steamId;
  const loaded = result?.steamId === steamId ? result : null;
  const profile = steamProfile?.steamId === steamId ? steamProfile : null;
  const rank = rankResult?.steamId === steamId ? rankResult : null;

  useEffect(() => {
    let cancelled = false;

    fetchPlayerInfo(steamId)
      .then((info) => {
        if (!cancelled) {
          setResult({ steamId, status: 'ready', info });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setResult({
            steamId,
            status: 'failed',
            httpStatus: error instanceof ApiError ? error.status : 0,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [steamId]);

  // 昵称头像单独发一次，与上面那次并行：它要向 Steam 取数，快慢不该拖住整页
  useEffect(() => {
    let cancelled = false;

    fetchSteamProfile(steamId).then((fetched) => {
      if (!cancelled) {
        setSteamProfile(fetched);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [steamId]);

  // 名次也单独发：要在库里数人数，比读玩家数据慢，取失败时入口卡照常能点，只是不带标签
  useEffect(() => {
    let cancelled = false;

    fetchBattleRank(steamId)
      .then((fetched) => {
        if (!cancelled) {
          setRankResult({ steamId, rank: fetched });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRankResult({ steamId, failed: true });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [steamId]);

  if (loaded?.status === 'failed') {
    // 页面不判断登录，看得到看不到由接口说了算
    if (loaded.httpStatus === 401) {
      return <LoginPanel />;
    }
    const key = FAILURE_KEY[loaded.httpStatus] ?? 'failed';
    return (
      <Notice title={t(`${key}.title`)}>
        <p className="text-content">{t(`${key}.description`)}</p>
      </Notice>
    );
  }

  const info = loaded?.info ?? null;

  return (
    // 电脑宽度左栏放身份卡、右栏放等级卡与入口卡，两张战绩卡通栏；更窄时按 DOM 顺序单列，入口卡从平板起两张一行
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
          isSelf ? (player) => setResult({ steamId, status: 'ready', info: player }) : undefined
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
                <Skeleton>{t('entries.awaken.badge', { awakened: 0, total: AWAKEN_HERO_COUNT })}</Skeleton>
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
              !rank ? (
                <Skeleton>{t('entries.leaderboard.badge', { rank: '000' })}</Skeleton>
              ) : 'failed' in rank ? undefined : (
                t('entries.leaderboard.badge', { rank: formatBattleRank(rank.rank) })
              )
            }
            href="/leaderboard"
          />
        </div>
      </div>
      <div className="lg:col-span-3 grid gap-6">
        <StatsCard info={info} />
        {/* 自己发一次请求：满员 50 场约 50 KB，挂在首屏那次请求上会拖慢整页 */}
        <RecentMatchesCard steamId={steamId} />
      </div>
    </div>
  );
}
