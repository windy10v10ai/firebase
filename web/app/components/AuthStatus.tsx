'use client';

import { LogOut, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { useAuth } from '@/app/lib/auth';
import { playerPagePath } from '@/app/lib/player-path';

import SteamLoginButton from './SteamLoginButton';

export default function AuthStatus() {
  const t = useTranslations('auth');
  const auth = useAuth();

  if (auth.status === 'loading') {
    return null;
  }

  if (auth.status === 'unauthenticated') {
    return <SteamLoginButton />;
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href={playerPagePath(auth.uid)}
        title={t('profileTooltip')}
        aria-label={t('profileTooltip')}
        className="inline-flex items-center gap-2 whitespace-nowrap text-content link-hover"
      >
        {/* 窄屏放不下 10 位 ID，退回图标；ID 本身在个人主页上显示 */}
        <UserRound className="size-5 shrink-0" aria-hidden="true" />
        <span className="hidden md:inline">{t('loggedInAs', { uid: auth.uid })}</span>
      </Link>
      <button
        type="button"
        onClick={() => auth.signOut()}
        title={t('signOut')}
        aria-label={t('signOut')}
        className="rounded bg-control p-1.5 text-content hover:bg-control-hover"
      >
        <LogOut className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
