'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { useAuth } from '@/app/lib/auth';

import SteamIcon from './SteamIcon';
import { STEAM_BUTTON_CLASS, STEAM_BUTTON_SIZE_CLASS } from './ui/button';

interface SteamLoginButtonProps {
  size?: 'default' | 'large';
  /** cta：首页首屏唯一的主操作，通栏强调按钮；其余场景用次按钮外观 */
  variant?: 'steam' | 'cta';
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

  if (variant === 'cta') {
    return (
      <a
        href={href}
        title={t('loginTooltip')}
        aria-label={t('login')}
        className="btn-cta h-13 w-full text-base"
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
      <span>{size === 'large' ? t('login') : t('loginShort')}</span>
    </a>
  );
}
