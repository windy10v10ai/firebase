'use client';

import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import LoginPanel from '@/app/components/LoginPanel';
import Notice from '@/app/components/Notice';
import PageSkeleton from '@/app/components/PageSkeleton';
import { ApiError } from '@/app/lib/api';
import { useAuth } from '@/app/lib/auth';
import { fetchPlayerInfo, type PlayerInfo } from '@/app/lib/player-info';

import IdentityCard from './IdentityCard';
import MemberCard from './MemberCard';
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
    <div className="space-y-6">
      <IdentityCard info={loaded.info} />
      <StatsCard info={loaded.info} />
      <MemberCard member={loaded.info.member} />
    </div>
  );
}
