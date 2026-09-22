'use client';

import { ArrowDown, ArrowUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import PlayerAvatar from '@/app/components/PlayerAvatar';
import SteamLoginButton from '@/app/components/SteamLoginButton';
import Skeleton from '@/app/components/ui/skeleton';
import { useAuth } from '@/app/lib/auth';
import { fetchBattleRank, formatBattleRank } from '@/app/lib/leaderboard';
import { fetchSteamProfile, type SteamProfile } from '@/app/lib/steam-profile';

import type { ReactNode, RefObject } from 'react';

// 底栏高度加一点余量：自己那一行被底栏盖住时不算「看得见」
const BAR_OCCLUSION_MARGIN = '0px 0px -72px 0px';

const BAR_CLASS =
  'sticky bottom-0 z-10 flex h-16 w-full items-center gap-3 border-t border-line-strong bg-panel-raised px-3 text-left shadow-[inset_2px_0_0_var(--color-season-strong)] md:h-17 md:px-4';

type Direction = 'up' | 'down' | null;

interface MyRankBarProps {
  uid: string | null;
  /** 榜单是否已经取到；没取到时还不知道自己在不在榜上 */
  loaded: boolean;
  /** 自己在榜上时的名次，不在榜上为 null */
  listRank: number | null;
  myRowRef: RefObject<HTMLLIElement | null>;
}

/** 贴在榜单底部的「我的排名」栏；在榜上时整条可点，滚到自己那一行 */
export default function MyRankBar({ uid, loaded, listRank, myRowRef }: MyRankBarProps) {
  const t = useTranslations('leaderboard');
  const auth = useAuth();
  const [profile, setProfile] = useState<SteamProfile | null>(() => auth.initialProfile);
  // 带上请求时的 uid，换号后旧结果立刻失效
  const [liveRank, setLiveRank] = useState<{ uid: string; rank: number | null | 'failed' } | null>(
    null,
  );
  const [direction, setDirection] = useState<Direction>(null);

  useEffect(() => {
    if (!uid) {
      return;
    }
    let cancelled = false;
    fetchSteamProfile(uid).then((fetched) => {
      if (!cancelled) {
        setProfile(fetched);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  // 不在榜上才需要实时名次；在榜上直接用榜单的名次，与列表保持一致
  const needsLiveRank = uid !== null && loaded && listRank === null;
  useEffect(() => {
    if (!needsLiveRank || !uid) {
      return;
    }
    let cancelled = false;
    fetchBattleRank(uid)
      .then((rank) => {
        if (!cancelled) {
          setLiveRank({ uid, rank });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLiveRank({ uid, rank: 'failed' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [needsLiveRank, uid]);

  const inList = listRank !== null;
  useEffect(() => {
    const row = myRowRef.current;
    if (!inList || !row) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry || entry.isIntersecting) {
          setDirection(null);
          return;
        }
        setDirection(entry.boundingClientRect.top < 0 ? 'up' : 'down');
      },
      { rootMargin: BAR_OCCLUSION_MARGIN },
    );
    observer.observe(row);
    return () => observer.disconnect();
  }, [inList, myRowRef]);

  if (!uid) {
    return (
      <div className={BAR_CLASS}>
        <span className="min-w-0 flex-1 text-content">{t('loginPrompt')}</span>
        <SteamLoginButton />
      </div>
    );
  }

  const identity = (rankText: ReactNode) => (
    <>
      <span className="min-w-11 shrink-0 whitespace-nowrap text-center text-lg font-bold text-season">
        {rankText}
      </span>
      <PlayerAvatar
        avatarUrl={profile?.steamId === uid ? profile.avatarUrl : null}
        imageClassName="size-9 shrink-0 rounded-lg md:size-10"
        iconClassName="size-9 shrink-0 rounded-lg bg-panel-soft p-2 text-muted md:size-10"
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-bold text-heading">
          {(profile?.steamId === uid && profile.personaName) || uid}
        </span>
        <span className="text-xs text-muted">{t('myRank')}</span>
      </span>
    </>
  );

  if (listRank !== null) {
    const Arrow = direction === 'up' ? ArrowUp : ArrowDown;
    return (
      <button
        type="button"
        onClick={() => {
          const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          myRowRef.current?.scrollIntoView({
            behavior: reduceMotion ? 'auto' : 'smooth',
            block: 'center',
          });
        }}
        aria-label={t('locateMe')}
        className={`${BAR_CLASS} transition-colors hover:bg-line`}
      >
        {identity(listRank)}
        {/* 看得见自己那一行时箭头隐藏但占位，底栏不跳 */}
        <span
          className={`flex size-8 shrink-0 items-center justify-center rounded-full border border-line-strong text-content ${
            direction ? '' : 'invisible'
          }`}
        >
          <Arrow className="size-4" aria-hidden="true" />
        </span>
      </button>
    );
  }

  const current = liveRank?.uid === uid ? liveRank.rank : undefined;
  let rankText: ReactNode;
  if (current === undefined) {
    rankText = <Skeleton>000</Skeleton>;
  } else if (current === 'failed') {
    rankText = '—';
  } else {
    rankText = formatBattleRank(current);
  }

  return <div className={BAR_CLASS}>{identity(rankText)}</div>;
}
