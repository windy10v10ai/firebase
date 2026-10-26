'use client';

import {
  BookOpen,
  CalendarCheck,
  ChartNoAxesColumn,
  Crown,
  ExternalLink,
  LogOut,
  MessageSquareText,
  Play,
  Sparkles,
  Trophy,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { useAuth } from '@/app/lib/auth';
import { EXTERNAL_LINKS } from '@/config/links';
import { NAV_MENU_GROUPS, SITE_NAV_ITEMS } from '@/config/nav';
import { LOCALES } from '@/i18n/locales';

import AuthStatus from './AuthStatus';
import GithubIcon from './GithubIcon';
import LanguageSwitcher from './LanguageSwitcher';
import SteamIcon from './SteamIcon';

const EXTERNAL_LINK_ICONS: Record<string, typeof GithubIcon> = {
  workshop: SteamIcon,
  github: GithubIcon,
};

// 每个功能一个颜色，与首页、个人主页的入口卡一致，见 docs/web/design-system.md「功能色」
const SITE_NAV_ICONS: Record<
  string,
  { Icon: typeof ChartNoAxesColumn; className: string; tile: string }
> = {
  profile: { Icon: UserRound, className: 'text-content', tile: 'bg-icon-tile' },
  property: {
    Icon: ChartNoAxesColumn,
    className: 'text-feature-property',
    tile: 'bg-feature-property-soft',
  },
  awaken: { Icon: Sparkles, className: 'text-feature-awaken', tile: 'bg-feature-awaken-soft' },
  dailyTask: {
    Icon: CalendarCheck,
    className: 'text-feature-daily',
    tile: 'bg-feature-daily-soft',
  },
  membership: { Icon: Crown, className: 'text-member-strong', tile: 'bg-member-soft' },
  leaderboard: { Icon: Trophy, className: 'text-season', tile: 'bg-season-soft' },
  wiki: { Icon: BookOpen, className: 'text-feature-wiki', tile: 'bg-feature-wiki-soft' },
  // 启动游戏与反馈不属于任何一块玩家数据，用中性色
  launch: { Icon: Play, className: 'text-content', tile: 'bg-icon-tile' },
  feedback: { Icon: MessageSquareText, className: 'text-content', tile: 'bg-icon-tile' },
};

const NAV_ICON_TILE_CLASS = 'grid size-7 shrink-0 place-items-center rounded-[7px]';

// 滚动距离不超过这个值仍算在页面顶部，免得触控板的微小抖动让头部来回变色
const AT_TOP_THRESHOLD = 8;

export default function Header() {
  const t = useTranslations('navigation');
  const tAuth = useTranslations('auth');
  const locale = useLocale();
  const compactNav = LOCALES.some((entry) => entry.code === locale && 'compactNav' in entry);
  const desktopOnlyClass = compactNav ? ' hidden' : ' hidden lg:inline';
  const auth = useAuth();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  // 服务端渲染与首帧按「在顶部」画：首页打开时就在顶部
  const [atTop, setAtTop] = useState(true);
  // 菜单是实心的，打开时头部跟着变实心，两块连成一体
  const transparent = pathname === '/' && atTop && !menuOpen;

  useEffect(() => {
    const update = () => setAtTop(window.scrollY <= AT_TOP_THRESHOLD);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

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

  const topRowNavItems = SITE_NAV_ITEMS.filter(
    (item): item is typeof item & { href: string } => item.href !== null && !('menuOnly' in item),
  );
  const githubLink = EXTERNAL_LINKS.find((link) => link.labelKey === 'github');
  // /my/<页> 登录后会转到 /profile/<id>/<页>，两个地址算停在同一项上；看别人的主页不算停在自己的菜单项上
  const ownProfilePrefix = auth.status === 'authenticated' ? `/profile/${auth.uid}` : null;
  const profileSubPath =
    ownProfilePrefix &&
    (pathname === ownProfilePrefix || pathname.startsWith(`${ownProfilePrefix}/`))
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
    <header
      ref={headerRef}
      data-transparent={transparent || undefined}
      className={`sticky top-0 z-20 border-b font-heading transition-colors duration-150 ease-out ${
        transparent ? 'border-transparent bg-transparent' : 'border-line bg-panel'
      }`}
    >
      {/* 菜单浮层以它定位：平板起贴着外框右缘弹出，屏幕再宽也对着汉堡按钮 */}
      <nav className="relative mx-auto max-w-7xl px-3 py-2.5 md:px-4 lg:py-4">
        {/* 行高由账号位控件撑起，兜底防止它缺席时整行变矮、正文跟着跳 */}
        <div className="flex min-h-11 items-center justify-between gap-3 lg:min-h-9">
          {/* 每页都常驻的链接不预取：页面全是动态渲染，每次预取都是一次函数调用，按页面浏览量成倍放大 */}
          <Link
            href="/"
            prefetch={false}
            className="flex items-center gap-2 text-xl font-bold text-heading link-hover whitespace-nowrap"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- 固定尺寸的本地小图，不需要 next/image 的裁剪与响应式 */}
            <img
              src="/images/launcher.webp"
              alt=""
              width={32}
              height={32}
              className="size-8 shrink-0"
            />
            {/* 1024 以下一律收短：全名加五个站内项在 768 会把右侧控件挤出屏幕 */}
            <span className="lg:hidden">{t('homeShort')}</span>
            <span className="hidden lg:inline">{t('home')}</span>
          </Link>
          <div className="flex items-center gap-2 lg:gap-3">
            <div className="hidden md:flex items-center gap-4">
              {topRowNavItems.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  prefetch={false}
                  aria-current={
                    isCurrent('section' in item ? item.section : item.href) ? 'page' : undefined
                  }
                  className={`nav-top${'desktopOnly' in item ? desktopOnlyClass : ''}`}
                >
                  {t(item.shortLabelKey)}
                </Link>
              ))}
              <span className="h-4 w-px bg-line header-divider" aria-hidden="true" />
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
            <span className="hidden h-5 w-px bg-line header-divider lg:block" aria-hidden="true" />
            <AuthStatus />
            {/* 汉堡是「打开菜单」的开关而不是导航项，窄屏下又是唯一入口，所以不标当前页 */}
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={t('menu')}
              aria-expanded={menuOpen}
              aria-controls="header-menu"
              className="flex size-11 items-center justify-center rounded-md border border-line bg-control text-content transition-colors hover:bg-control-hover header-control lg:size-9"
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
        {/*
          浮层下方是正文，底色必须不透明，否则两层文字叠在一起。
          手机铺满整行好点按；平板起改成挂在汉堡按钮下的面板，宽屏上菜单项不会远离按钮。
          关上时仍挂在页面里，收起动画才放得完；visibility 随过渡最后才切换，收起后读屏和 Tab 都碰不到
        */}
        <div
          id="header-menu"
          inert={!menuOpen}
          className={`absolute inset-x-0 top-full z-20 border-b border-line bg-panel px-4 py-2 transition-[opacity,transform,visibility] duration-150 ease-out md:left-auto md:right-4 md:w-72 md:rounded-[10px] md:border md:shadow-[0_18px_40px_-10px_rgba(0,0,0,0.85)] ${
            menuOpen ? 'visible translate-y-0 opacity-100' : 'invisible -translate-y-1 opacity-0'
          }`}
        >
          {NAV_MENU_GROUPS.map((group, index) => (
            <div key={group} role="group" aria-labelledby={`header-menu-${group}`}>
              {index > 0 ? <div className="my-1 h-px bg-line" aria-hidden="true" /> : null}
              <p id={`header-menu-${group}`} className="pt-2 pb-0.5 text-xs text-muted">
                {t(`menuGroups.${group}`)}
              </p>
              {SITE_NAV_ITEMS.filter((item) => item.group === group).map((item) => {
                const { Icon, className, tile } = SITE_NAV_ICONS[item.key]!;
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    prefetch={false}
                    onClick={() => setMenuOpen(false)}
                    aria-current={
                      isCurrent('section' in item ? item.section : item.href) ? 'page' : undefined
                    }
                    className="nav-menu-item"
                  >
                    <span className={`${NAV_ICON_TILE_CLASS} ${tile}`}>
                      <Icon
                        className={`size-[17px] ${className}`}
                        strokeWidth={1.7}
                        aria-hidden="true"
                      />
                    </span>
                    <span className="flex-1">{t(item.fullLabelKey)}</span>
                  </Link>
                );
              })}
              {group === 'community'
                ? EXTERNAL_LINKS.map((link) => {
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
                        <span className={`${NAV_ICON_TILE_CLASS} bg-icon-tile`}>
                          <Icon className="size-[17px]" />
                        </span>
                        <span className="flex-1">{t(link.labelKey)}</span>
                        <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
                      </a>
                    );
                  })
                : null}
            </div>
          ))}
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
      </nav>
    </header>
  );
}
