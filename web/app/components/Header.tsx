'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { EXTERNAL_LINKS } from '@/config/links';

import LanguageSwitcher from './LanguageSwitcher';

export default function Header() {
  const t = useTranslations('navigation');
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

  return (
    <header ref={headerRef} className="card-container relative shadow-lg border-b border-gray-700">
      <nav className="container mx-auto px-4 py-4">
        <div className="flex justify-between items-center gap-3">
          <Link href="/" className="text-xl font-bold text-white link-hover">
            {t('home')}
          </Link>
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-4">
              {EXTERNAL_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-content link-hover whitespace-nowrap"
                >
                  {t(link.labelKey)}
                </a>
              ))}
            </div>
            <LanguageSwitcher />
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={t('menu')}
              aria-expanded={menuOpen}
              aria-controls="header-menu"
              className="md:hidden rounded bg-gray-700 p-1 text-gray-200 hover:bg-gray-600"
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
            className="md:hidden absolute inset-x-0 top-full z-20 border-b border-gray-700 bg-gray-800 px-4 py-2 shadow-lg"
          >
            {EXTERNAL_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMenuOpen(false)}
                className="block py-2 text-content link-hover"
              >
                {t(link.labelKey)}
              </a>
            ))}
          </div>
        ) : null}
      </nav>
    </header>
  );
}
