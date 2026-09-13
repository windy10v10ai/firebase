'use client';

import { CirclePlus, Sparkles } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import LoginPanel from '@/app/components/LoginPanel';
import Notice from '@/app/components/Notice';
import PageSkeleton from '@/app/components/PageSkeleton';
import { ApiError } from '@/app/lib/api';
import { useAuth } from '@/app/lib/auth';
import { fetchPlayerInfo, type PlayerInfo } from '@/app/lib/player-info';
import { playerPagePath } from '@/app/lib/player-path';

import FeatureEntryCard from './FeatureEntryCard';
import LevelCard from './LevelCard';
import MemberCard from './MemberCard';
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
  const [result, setResult] = useState<LoadResult | null>(null);

  const authResolved = auth.status !== 'loading';
  const loaded = result?.steamId === steamId ? result : null;

  useEffect(() => {
    // 登录态还在恢复时请求发不出 token，会拿到一个不代表真实结果的 401
    if (!authResolved) {
      return;
    }

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
  }, [authResolved, steamId]);

  if (!loaded) {
    return <PageSkeleton label={t('loading')} />;
  }

  if (loaded.status === 'failed') {
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

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(260px,320px)_1fr] lg:items-start">
      {/* 窄屏走 DOM 顺序单列；宽屏用显式网格坐标拆成左右两栏 */}
      <div className="lg:col-start-1 lg:row-start-1">
        <PlayerCard info={loaded.info} />
      </div>
      <div className="lg:col-start-2 lg:row-start-1">
        <LevelCard info={loaded.info} steamId={steamId} />
      </div>
      <div className="lg:col-start-2 lg:row-start-2">
        <FeatureEntryCard
          Icon={CirclePlus}
          title={t('entries.property.title')}
          description={t('entries.property.description')}
          badge={t('entries.property.badge', { count: loaded.info.useableLevel })}
          href={playerPagePath(steamId, 'property')}
        />
      </div>
      <div className="lg:col-start-2 lg:row-start-3">
        <FeatureEntryCard
          Icon={Sparkles}
          title={t('entries.awaken.title')}
          description={t('entries.awaken.description')}
        />
      </div>
      <div className="lg:col-start-2 lg:row-start-4">
        <StatsCard info={loaded.info} />
      </div>
      {/* 跨 3 行接到战绩卡底部，让空档落在整块左栏末尾，不夹在两张入口卡中间 */}
      <div className="lg:col-start-1 lg:row-start-2 lg:row-end-5">
        <MemberCard member={loaded.info.member} />
      </div>
    </div>
  );
}
