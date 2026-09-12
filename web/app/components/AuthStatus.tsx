'use client';

import { LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useAuth } from '@/app/lib/auth';

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
      <span className="text-content whitespace-nowrap">{t('loggedInAs', { uid: auth.uid })}</span>
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
