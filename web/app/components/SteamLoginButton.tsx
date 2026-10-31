'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { useAuth } from '@/app/lib/auth';

import SteamIcon from './SteamIcon';
import { STEAM_BUTTON_CLASS, STEAM_BUTTON_SIZE_CLASS } from './ui/button';

interface SteamLoginButtonProps {
  size?: 'default' | 'large' | 'wide';
  /** glass：首页首屏压在背景图上的通栏按钮；其余场景用次按钮外观 */
  variant?: 'steam' | 'glass';
  className?: string;
}

export default function SteamLoginButton({
  size = 'default',
  variant = 'steam',
  className = '',
}: SteamLoginButtonProps) {
  const t = useTranslations('auth');
  const pathname = usePathname();
  const { loginUrl } = useAuth();
  const href = loginUrl(pathname);

  if (variant === 'glass') {
    return (
      <a
        href={href}
        title={t('loginTooltip')}
        aria-label={t('login')}
        className="btn-glass w-full text-base lg:h-13"
      >
        <SteamIcon className="size-5 shrink-0" />
        <span>{t('login')}</span>
      </a>
    );
  }

  return (
    <a
      href={href}
      title={t('loginTooltip')}
      aria-label={t('login')}
      className={`${STEAM_BUTTON_CLASS} ${STEAM_BUTTON_SIZE_CLASS[size]} ${className}`}
    >
      <SteamIcon className={size === 'large' ? 'size-6 shrink-0' : 'size-5 shrink-0'} />
      <span>{size === 'default' ? t('loginShort') : t('login')}</span>
    </a>
  );
}
