'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { buildSteamLoginUrl } from '@/app/lib/steam-login';

import SteamIcon from './SteamIcon';

// 只在 AuthStatus 判定为未登录后才会挂载，这时早已过了服务端渲染阶段，
// window.location.origin 一定可用，不用担心跳转链接为空
export default function SteamLoginButton() {
  const t = useTranslations('auth');
  const pathname = usePathname();
  const href = buildSteamLoginUrl(pathname);

  return (
    <a
      href={href}
      title={t('loginTooltip')}
      aria-label={t('login')}
      className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-md bg-control px-3 text-content transition-colors hover:bg-control-hover"
    >
      <SteamIcon className="size-5 shrink-0" />
      <span className="hidden md:inline">{t('login')}</span>
    </a>
  );
}
