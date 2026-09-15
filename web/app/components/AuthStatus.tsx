'use client';

import { LogOut } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { useAuth } from '@/app/lib/auth';
import { playerPagePath } from '@/app/lib/player-path';
import { fetchSteamProfile, type SteamProfile } from '@/app/lib/steam-profile';

import PlayerAvatar from './PlayerAvatar';
import SteamLoginButton from './SteamLoginButton';

export default function AuthStatus() {
  const t = useTranslations('auth');
  const auth = useAuth();
  const uid = auth.status === 'authenticated' ? auth.uid : null;
  const [loaded, setLoaded] = useState<SteamProfile | null>(() => auth.initialProfile);
  // 换了账号时旧资料立刻失效，不用先手动置空
  const profile = loaded?.steamId === uid ? loaded : null;

  useEffect(() => {
    if (!uid) {
      return;
    }
    let cancelled = false;
    fetchSteamProfile(uid).then((fetched) => {
      if (!cancelled) {
        setLoaded(fetched);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  if (uid === null) {
    return <SteamLoginButton />;
  }

  return (
    // ID 与退出合并进同一条 36px 背景，见 phase-2g-header-layout.md；退出单独占一格，点 ID 时不会误点到它
    <div className="flex h-9 items-stretch overflow-hidden whitespace-nowrap rounded-md border border-line bg-control text-content">
      <Link
        href={playerPagePath(uid)}
        title={t('profileTooltip')}
        aria-label={t('profileTooltip')}
        className="flex items-center gap-1.5 px-2.5 link-hover"
      >
        <PlayerAvatar
          avatarUrl={profile?.avatarUrl}
          imageClassName="size-5 shrink-0 rounded-full object-cover"
          iconClassName="size-5 shrink-0"
        />
        {/* 手机与平板放不下文字，退回只有头像；昵称上限见 phase-9-steam-profile.md */}
        <span className="hidden max-w-40 truncate lg:block">
          {profile?.personaName ?? t('loggedInAs', { uid })}
        </span>
      </Link>
      <span className="hidden w-px bg-line lg:block" aria-hidden="true" />
      <button
        type="button"
        onClick={() => auth.signOut()}
        title={t('signOut')}
        aria-label={t('signOut')}
        className="hidden w-[34px] items-center justify-center transition-colors hover:bg-danger/12 hover:text-danger lg:flex"
      >
        <LogOut className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
