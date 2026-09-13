'use client';

import { ExternalLink, LogOut } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { useAuth } from '@/app/lib/auth';
import { EXTERNAL_LINKS } from '@/config/links';
import { SITE_NAV_ITEMS } from '@/config/nav';

import AuthStatus from './AuthStatus';
import GithubIcon from './GithubIcon';
import LanguageSwitcher from './LanguageSwitcher';
import SteamIcon from './SteamIcon';

const EXTERNAL_LINK_ICONS: Record<string, typeof GithubIcon> = {
  workshop: SteamIcon,
  github: GithubIcon,
};

export default function Header() {
  const t = useTranslations('navigation');
  const tAuth = useTranslations('auth');
  const auth = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  // 菜单浮在内容上方，点到页面别处或按 Esc 都应该关掉，而不是只能再点一次汉堡
  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [menuOpen]);

  const visibleSiteNavItems = SITE_NAV_ITEMS.filter(
    (item): item is typeof item & { href: string } => item.href !== null,
  );
  const githubLink = EXTERNAL_LINKS.find((link) => link.labelKey === 'github');

  return (
    // 显式 z-index 让 header 在层叠上下文里高于 z-0/auto 层级，否则页面内容中带
    // backdrop-filter 的卡片（card-container）会各自成一个新的层叠上下文，
    // 按文档顺序排在 header 之后，把汉堡菜单盖住
    <header
      ref={headerRef}
      className="card-container relative z-20 shadow-lg border-b border-line"
    >
      <nav className="container mx-auto px-4 py-4">
        <div className="flex justify-between items-center gap-3">
          <Link href="/" className="text-xl font-bold text-heading link-hover whitespace-nowrap">
            {/* 窄屏已登录时品牌收短，否则配上 ID 会横向溢出，见 phase-2g-header-layout.md */}
            <span className={auth.status === 'authenticated' ? 'md:hidden' : 'hidden'}>
              {t('homeShort')}
            </span>
            <span className={auth.status === 'authenticated' ? 'hidden md:inline' : ''}>
              {t('home')}
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-4">
              {visibleSiteNavItems.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  className="text-content link-hover whitespace-nowrap"
                >
                  {t(item.shortLabelKey)}
                </Link>
              ))}
              <span className="h-4 w-px bg-line" aria-hidden="true" />
              {githubLink ? (
                <a
                  href={githubLink.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={t(githubLink.labelKey)}
                  aria-label={t(githubLink.labelKey)}
                  className="text-content link-hover"
                >
                  <GithubIcon className="size-5" />
                </a>
              ) : null}
            </div>
            <LanguageSwitcher />
            <span className="h-5 w-px bg-line" aria-hidden="true" />
            <AuthStatus />
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={t('menu')}
              aria-expanded={menuOpen}
              aria-controls="header-menu"
              className="rounded bg-control p-1 text-content hover:bg-control-hover"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                {menuOpen ? (
                  <path d="M6 6l12 12M18 6L6 18" />
                ) : (
                  <path d="M4 7h16M4 12h16M4 17h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
        {menuOpen ? (
          // 背景用不透明色，浮层下方是正文，半透明会让两层文字叠在一起
          <div
            id="header-menu"
            className="absolute inset-x-0 top-full z-20 border-b border-line bg-panel px-4 py-2 shadow-lg"
          >
            {SITE_NAV_ITEMS.map((item) =>
              item.href === null ? null : (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className="block py-2 pl-7 text-content link-hover"
                >
                  {t(item.fullLabelKey)}
                </Link>
              ),
            )}
            <div className="my-1 h-px bg-line" aria-hidden="true" />
            {EXTERNAL_LINKS.map((link) => {
              const Icon = EXTERNAL_LINK_ICONS[link.labelKey]!;
              return (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 py-2 text-content link-hover"
                >
                  <Icon className="size-5 shrink-0" />
                  <span className="flex-1">{t(link.labelKey)}</span>
                  <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
                </a>
              );
            })}
            {auth.status === 'authenticated' ? (
              <>
                <div className="my-1 h-px bg-line md:hidden" aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    auth.signOut();
                  }}
                  className="flex md:hidden w-full items-center justify-between py-2 text-content link-hover"
                >
                  <span>{tAuth('signOut')}</span>
                  <LogOut className="size-4 shrink-0" aria-hidden="true" />
                </button>
              </>
            ) : null}
          </div>
        ) : null}
      </nav>
    </header>
  );
}
