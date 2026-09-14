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

  if (auth.status === 'unauthenticated') {
    return <SteamLoginButton />;
  }

  return (
    // ID 与退出合并进同一条 36px 背景，见 phase-2g-header-layout.md；退出单独占一格，点 ID 时不会误点到它
    <div className="flex h-9 items-stretch overflow-hidden whitespace-nowrap rounded-md border border-line bg-control text-content">
      <Link
        href={playerPagePath(auth.uid)}
        title={t('profileTooltip')}
        aria-label={t('profileTooltip')}
        className="flex items-center gap-1.5 px-2.5 link-hover"
      >
        {/* 手机与平板放不下 ID，退回图标；ID 本身在个人主页上显示 */}
        <UserRound className="size-5 shrink-0" aria-hidden="true" />
        <span className="hidden lg:inline">{t('loggedInAs', { uid: auth.uid })}</span>
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
