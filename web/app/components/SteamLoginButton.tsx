'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { useAuth } from '@/app/lib/auth';

import SteamIcon from './SteamIcon';
import { STEAM_BUTTON_CLASS, STEAM_BUTTON_SIZE_CLASS } from './ui/button';

interface SteamLoginButtonProps {
  size?: 'default' | 'large';
}

export default function SteamLoginButton({ size = 'default' }: SteamLoginButtonProps) {
  const t = useTranslations('auth');
  const pathname = usePathname();
  const { loginUrl } = useAuth();
  const href = loginUrl(pathname);

  return (
    <a
      href={href}
      title={t('loginTooltip')}
      aria-label={t('login')}
      className={`${STEAM_BUTTON_CLASS} ${STEAM_BUTTON_SIZE_CLASS[size]}`}
    >
      <SteamIcon className={size === 'large' ? 'size-6 shrink-0' : 'size-5 shrink-0'} />
      <span>{size === 'large' ? t('login') : t('loginShort')}</span>
    </a>
  );
}
