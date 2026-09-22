'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import Notice from '@/app/components/Notice';
import Skeleton from '@/app/components/ui/skeleton';
import { useAuth } from '@/app/lib/auth';
import { fetchLeaderboard, type Leaderboard } from '@/app/lib/leaderboard';

import LeaderboardRow from './LeaderboardRow';
import MyRankBar from './MyRankBar';

// 首屏占位的行数：大致铺满一屏，数据到了原地换成真实行
const PLACEHOLDER_ROWS = 12;

export default function LeaderboardPage() {
  const t = useTranslations('leaderboard');
  const auth = useAuth();
  const uid = auth.status === 'authenticated' ? auth.uid : null;
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [failed, setFailed] = useState(false);
  const myRowRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchLeaderboard()
      .then((result) => {
        if (!cancelled) {
          setBoard(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return (
      <Notice title={t('failed.title')}>
        <p className="text-content">{t('failed.description')}</p>
      </Notice>
    );
  }

  const myIndex = board && uid ? board.players.findIndex((player) => player.steamId === uid) : -1;

  return (
    <div className="space-y-4 md:space-y-6" aria-busy={!board}>
      <h1 className="title-primary">{t('title')}</h1>
      {/* overflow-clip 只裁圆角，不像 overflow-hidden 那样新建滚动容器，底栏的 sticky 才能贴住视口 */}
      <section className="card-container overflow-clip">
        <div className="flex h-10 items-center gap-3 border-b border-line bg-panel-soft px-3 text-sm text-muted md:px-4">
          <span className="w-11 shrink-0 text-center">{t('columns.rank')}</span>
          <span>{t('columns.player')}</span>
        </div>
        <ol>
          {board
            ? board.players.map((player, index) => (
                <LeaderboardRow
                  key={player.steamId}
                  ref={index === myIndex ? myRowRef : undefined}
                  rank={index + 1}
                  player={player}
                  isMe={index === myIndex}
                />
              ))
            : Array.from({ length: PLACEHOLDER_ROWS }, (_, index) => (
                <li key={index} className="flex h-13 items-center gap-3 border-b border-panel-raised px-3 md:h-14 md:px-4">
                  <span className="w-11 shrink-0 text-center">
                    <Skeleton>00</Skeleton>
                  </span>
                  <span className="size-9 shrink-0 animate-pulse rounded-lg bg-line md:size-10" />
                  <Skeleton>0000000000</Skeleton>
                </li>
              ))}
        </ol>
        <MyRankBar
          uid={uid}
          loaded={board !== null}
          listRank={myIndex >= 0 ? myIndex + 1 : null}
          myRowRef={myRowRef}
        />
      </section>
    </div>
  );
}
