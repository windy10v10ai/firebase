import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { EXTERNAL_LINKS } from '@/config/links';

const COPYRIGHT_START_YEAR = 2025;

export default async function Footer() {
  const t = await getTranslations('navigation');

  return (
    <footer className="card-container border-t border-line">
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
          <p className="text-content">
            © {COPYRIGHT_START_YEAR}–{new Date().getFullYear()} Windy10v10ai. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
