'use client';

import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import LoginPanel from '@/app/components/LoginPanel';
import Notice from '@/app/components/Notice';
import { ApiError } from '@/app/lib/api';
import { fetchDailyTask, refreshDailyTask, type DailyTaskSnapshot } from '@/app/lib/daily-task';

import HistoryCard from './HistoryCard';
import SummaryCard from './SummaryCard';
import TodayCard from './TodayCard';

// 带上请求时用的 steamId，换一个玩家时旧结果立刻失效
type LoadResult =
  | { steamId: string; status: 'failed'; httpStatus: number }
  | { steamId: string; status: 'ready'; snapshot: DailyTaskSnapshot };

const FAILURE_KEY: Record<number, string> = {
  403: 'private',
  404: 'noRecord',
};

export default function DailyTaskPage() {
  const t = useTranslations('dailyTask');
  const { steamId } = useParams<{ steamId: string }>();

  const [result, setResult] = useState<LoadResult | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetchDailyTask(steamId)
      .then((snapshot) => {
        if (!cancelled) {
          setResult({ steamId, status: 'ready', snapshot });
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

  const loaded = result?.steamId === steamId ? result : null;
  const snapshot = loaded?.status === 'ready' ? loaded.snapshot : null;

  const handleRefresh = useCallback(async () => {
    if (!snapshot) {
      return;
    }
    setRefreshing(true);
    setRefreshFailed(false);
    try {
      const next = await refreshDailyTask(steamId, snapshot.dayId);
      // 刷新的响应不带 history，手上那份仍然有效，不为了一次刷新重拉整页
      setResult({
        steamId,
        status: 'ready',
        snapshot: { ...next, history: next.history ?? snapshot.history },
      });
    } catch {
      setRefreshFailed(true);
    } finally {
      setRefreshing(false);
    }
  }, [snapshot, steamId]);

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

  return (
    <div className="grid gap-6" aria-busy={!snapshot}>
      {snapshot ? null : (
        <p role="status" className="sr-only">
          {t('loading')}
        </p>
      )}

      <div>
        <h1 className="title-primary">{t('title')}</h1>
        <p className="mt-2 text-sm text-muted">{t('intro')}</p>
      </div>

      {/* 电脑宽度左栏今天、右栏历史；更窄时按 DOM 顺序单列 */}
      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        <div className="grid gap-6 lg:sticky lg:top-6">
          <TodayCard
            snapshot={snapshot}
            refreshing={refreshing}
            refreshFailed={refreshFailed}
            onRefresh={handleRefresh}
          />
          <SummaryCard snapshot={snapshot} />
        </div>
        <div className="lg:col-span-2">
          <HistoryCard entries={snapshot?.history ?? null} />
        </div>
      </div>
    </div>
  );
}
