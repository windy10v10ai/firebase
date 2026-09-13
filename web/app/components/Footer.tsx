import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { EXTERNAL_LINKS } from '@/config/links';

const COPYRIGHT_START_YEAR = 2025;

export default async function Footer() {
  const t = await getTranslations('navigation');

  return (
    <footer className="border-t border-line bg-panel">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col items-center space-y-4">
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
            {EXTERNAL_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-content link-hover"
              >
                {t(link.labelKey)}
              </a>
            ))}
            <Link href="/legal/disclosure" className="text-content link-hover">
              {t('disclosure')}
            </Link>
          </div>
          {/* 窄屏放不下一行，折行点固定在句子之间，不让 All rights reserved. 被拆开 */}
          <p className="text-center text-sm text-muted">
            <span className="whitespace-nowrap">
              © {COPYRIGHT_START_YEAR}–{new Date().getFullYear()} Windy10v10ai.
            </span>{' '}
            <span className="whitespace-nowrap">All rights reserved.</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
