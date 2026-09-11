'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import LanguageSwitcher from './LanguageSwitcher';

const NAV_LINKS = [{ href: '/legal/disclosure', labelKey: 'disclosure' }];

export default function Header() {
  const t = useTranslations('navigation');
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="card-container shadow-lg border-b border-gray-700">
      <nav className="container mx-auto px-4 py-4">
        <div className="flex justify-between items-center gap-3">
          <Link href="/" className="text-xl font-bold text-white link-hover">
            {t('home')}
          </Link>
          <div className="flex items-center space-x-4">
            <div className="hidden md:flex items-center space-x-4">
              {NAV_LINKS.map((link) => (
                <Link key={link.href} href={link.href} className="text-content link-hover">
                  {t(link.labelKey)}
                </Link>
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
          <div id="header-menu" className="md:hidden mt-4 border-t border-gray-700 pt-2">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="block py-2 text-content link-hover"
              >
                {t(link.labelKey)}
              </Link>
            ))}
          </div>
        ) : null}
      </nav>
    </header>
  );
}
