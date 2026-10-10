'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface WikiTabsProps {
  tabs: { href: string; label: string }[];
}

/** 技能与物品两页之间的切换，当前页的判断要读地址，所以单独做成客户端组件 */
export default function WikiTabs({ tabs }: WikiTabsProps) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 self-start rounded-[10px] border border-line bg-panel p-1 max-md:self-stretch">
      {tabs.map((tab) => {
        const current = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={current ? 'page' : undefined}
            className={`flex min-h-11 flex-1 items-center justify-center rounded-[7px] px-4.5 whitespace-nowrap transition-colors md:flex-none lg:min-h-10 ${
              current
                ? 'bg-panel-raised font-semibold text-heading'
                : 'text-content hover:text-heading'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
