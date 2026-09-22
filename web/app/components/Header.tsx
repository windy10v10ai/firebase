'use client';

import {
  BookOpen,
  CalendarCheck,
  CirclePlus,
  Crown,
  ExternalLink,
  LogOut,
  Play,
  Sparkles,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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

// 每个功能一个颜色，与首页、个人主页的入口卡一致，见 docs/design/web/phase-12-color-system.md
const SITE_NAV_ICONS: Record<string, { Icon: typeof CirclePlus; className: string }> = {
  profile: { Icon: UserRound, className: 'text-content' },
  property: { Icon: CirclePlus, className: 'text-feature-property' },
  awaken: { Icon: Sparkles, className: 'text-feature-awaken' },
  dailyTask: { Icon: CalendarCheck, className: 'text-feature-daily' },
  membership: { Icon: Crown, className: 'text-member-strong' },
  wiki: { Icon: BookOpen, className: 'text-feature-wiki' },
  // 启动游戏不属于任何一块玩家数据，用中性色
  launch: { Icon: Play, className: 'text-content' },
};

export default function Header() {
  const t = useTranslations('navigation');
  const tAuth = useTranslations('auth');
  const auth = useAuth();
  const pathname = usePathname();
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

  // 启动游戏是最常用的操作，横排里排在最前最好点；手机装不了 Steam，菜单不跟着调
  const topRowNavItems = SITE_NAV_ITEMS.filter(
    (item): item is typeof item & { href: string } => item.href !== null,
  ).sort((left, right) => Number('topFirst' in right) - Number('topFirst' in left));
  const githubLink = EXTERNAL_LINKS.find((link) => link.labelKey === 'github');
  // /my/<页> 登录后会转到 /profile/<id>/<页>，两个地址算停在同一项上
  const profileSubPath = pathname.startsWith('/profile/')
    ? pathname.split('/').slice(3).join('/')
    : null;
  const isCurrent = (href: string) => {
    if (href.startsWith('/my')) {
      // 前缀匹配会让 /my/property 把「个人主页」也点亮，所以这一支只认整段相等
      return pathname === href || profileSubPath === href.slice('/my'.length).replace(/^\//, '');
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    // 显式提层，否则页面里在 header 之后出现的定位元素会盖住展开的菜单
    <header ref={headerRef} className="relative z-20 border-b border-line bg-surface">
      <nav className="mx-auto max-w-7xl px-4 py-4">
        {/* 行高由账号位的 36px 控件撑起，兜底防止它缺席时整行变矮、正文跟着跳 */}
        <div className="flex min-h-9 justify-between items-center gap-3">
          <Link href="/" className="text-xl font-bold text-heading link-hover whitespace-nowrap">
            {/* 1024 以下一律收短：全名加五个站内项在 768 会把右侧控件挤出屏幕 */}
            <span className="lg:hidden">{t('homeShort')}</span>
            <span className="hidden lg:inline">{t('home')}</span>
          </Link>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-4">
              {topRowNavItems.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  aria-current={isCurrent(item.href) ? 'page' : undefined}
                  className={`nav-top${'desktopOnly' in item ? ' hidden lg:inline' : ''}`}
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
            {/* 汉堡是「打开菜单」的开关而不是导航项，窄屏下又是唯一入口，所以不标当前页 */}
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={t('menu')}
              aria-expanded={menuOpen}
              aria-controls="header-menu"
              className="rounded border border-line bg-control p-1 text-content transition-colors hover:bg-control-hover"
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
          // 浮层下方是正文，底色必须不透明，否则两层文字叠在一起
          <div
            id="header-menu"
            className="absolute inset-x-0 top-full z-20 border-b border-line bg-panel px-4 py-2"
          >
            {SITE_NAV_ITEMS.map((item) => {
              if (item.href === null) {
                return null;
              }
              const { Icon, className } = SITE_NAV_ICONS[item.key]!;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  aria-current={isCurrent(item.href) ? 'page' : undefined}
                  className="nav-menu-item"
                >
                  <Icon
                    className={`size-[19px] shrink-0 ${className}`}
                    strokeWidth={1.7}
                    aria-hidden="true"
                  />
                  <span className="flex-1">{t(item.fullLabelKey)}</span>
                </Link>
              );
            })}
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
                  className="nav-menu-item"
                >
                  <Icon className="size-[19px] shrink-0" />
                  <span className="flex-1">{t(link.labelKey)}</span>
                  <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
                </a>
              );
            })}
            {auth.status === 'authenticated' ? (
              <>
                {/* 电脑宽度头部账号控件里也有退出，菜单照样保留，所有宽度都能在同一处找到 */}
                <div className="my-1 h-px bg-line" aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    auth.signOut();
                  }}
                  className="nav-menu-item w-full justify-between"
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
