'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { buildSteamLoginUrl } from '@/app/lib/steam-login';

import SteamIcon from './SteamIcon';

interface SteamLoginButtonProps {
  size?: 'default' | 'large';
}

const SIZE_CLASS = {
  // 36px 高，与登录后的账号控件统一，见 phase-2g-header-layout.md
  default: 'h-9 gap-1.5 px-2.5',
  large: 'min-h-14 gap-3 px-6 text-lg',
};

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
      className={`inline-flex items-center whitespace-nowrap rounded-md bg-control text-content transition-colors hover:bg-control-hover ${SIZE_CLASS[size]}`}
    >
      <SteamIcon className={size === 'large' ? 'size-6 shrink-0' : 'size-5 shrink-0'} />
      <span>{size === 'large' ? t('login') : t('loginShort')}</span>
    </a>
  );
}
