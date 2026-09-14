'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { buildSteamLoginUrl } from '@/app/lib/steam-login';

import SteamIcon from './SteamIcon';
import { STEAM_BUTTON_CLASS, STEAM_BUTTON_SIZE_CLASS } from './ui/button';

interface SteamLoginButtonProps {
  size?: 'default' | 'large';
}

// 只在判定为未登录后才会挂载，这时早已过了服务端渲染阶段，
// window.location.origin 一定可用，不用担心跳转链接为空
export default function SteamLoginButton({ size = 'default' }: SteamLoginButtonProps) {
  const t = useTranslations('auth');
  const pathname = usePathname();
  const href = buildSteamLoginUrl(pathname);

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
