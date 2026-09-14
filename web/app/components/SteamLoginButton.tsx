'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { useAuth } from '@/app/lib/auth';

import SteamIcon from './SteamIcon';

interface SteamLoginButtonProps {
  size?: 'default' | 'large';
}

/** 跳去 Steam 的中性控件，登录与创意工坊订阅共用 */
export const STEAM_BUTTON_CLASS =
  'inline-flex items-center whitespace-nowrap rounded-md border border-line bg-control text-content transition-colors hover:bg-control-hover';

export const STEAM_BUTTON_SIZE_CLASS = {
  // 36px 高，与登录后的账号控件统一，见 phase-2g-header-layout.md
  default: 'h-9 gap-1.5 px-2.5',
  large: 'min-h-14 gap-3 px-6 text-lg',
};

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
