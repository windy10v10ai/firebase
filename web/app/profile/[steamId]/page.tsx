'use client';

import { CalendarCheck, CirclePlus, Sparkles } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import LoginPanel from '@/app/components/LoginPanel';
import Notice from '@/app/components/Notice';
import Skeleton from '@/app/components/ui/skeleton';
import { ApiError } from '@/app/lib/api';
import { useAuth } from '@/app/lib/auth';
import { fetchPlayerInfo, type PlayerInfo } from '@/app/lib/player-info';
import { playerPagePath } from '@/app/lib/player-path';
import { fetchSteamProfile, type SteamProfile } from '@/app/lib/steam-profile';
import { AWAKEN_HERO_COUNT } from '@/config/awaken';

import FeatureEntryCard from './FeatureEntryCard';
import LevelCard from './LevelCard';
import PlayerCard from './PlayerCard';
import StatsCard from './StatsCard';

// 带上请求时用的 steamId，换一个玩家时旧结果立刻失效，不用先手动置回加载中
type LoadResult =
  | { steamId: string; status: 'failed'; httpStatus: number }
  | { steamId: string; status: 'ready'; info: PlayerInfo };

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

  // 个人主页能看别人的，签到入口只给本人
  const isSelf = auth.status === 'authenticated' && auth.uid === steamId;
  const loaded = result?.steamId === steamId ? result : null;
  const profile = steamProfile?.steamId === steamId ? steamProfile : null;

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
    // 电脑宽度左栏放身份卡、右栏放等级卡与两张入口卡，战绩卡通栏；更窄时按 DOM 顺序单列
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
      <div className="grid gap-6 lg:col-span-2">
        <LevelCard info={info} />
        <FeatureEntryCard
          tone="property"
          Icon={CirclePlus}
          title={t('entries.property.title')}
          description={t('entries.property.description')}
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
          description={t('entries.awaken.description')}
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
          description={t('entries.dailyTask.description')}
          href={playerPagePath(steamId, 'daily-task')}
        />
      </div>
      <div className="lg:col-span-3">
        <StatsCard info={info} />
      </div>
    </div>
  );
}
