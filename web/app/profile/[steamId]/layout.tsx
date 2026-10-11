import { getTranslations } from 'next-intl/server';

import { pageTitle, SITE_NAME } from '@/app/lib/page-title';
import { fetchProfileShare, SHARE_IMAGE } from '@/app/lib/share-card';

import type { Metadata } from 'next';

// 页面本身是客户端组件，导不出 metadata
const profileTitle = pageTitle('navigation', 'profileFull');

// 标签页标题不带昵称，否则 GA 的页面标题报表会按玩家拆散；昵称只进分享卡片
export async function generateMetadata({
  params,
}: {
  params: Promise<{ steamId: string }>;
}): Promise<Metadata> {
  const { steamId } = await params;
  const [base, share] = await Promise.all([profileTitle(), fetchProfileShare(steamId)]);
  if (!share) {
    return base;
  }

  const t = await getTranslations('shareCard');
  const name = share.personaName ?? t('playerFallback', { steamId });
  const title = t('profileHeadline', { name });
  const description =
    share.matchCount > 0
      ? t('profileStats', { matches: share.matchCount, winRate: share.winCount / share.matchCount })
      : t('profileNoMatches', { name });
  const images = [share.avatarUrl ?? SHARE_IMAGE];

  return {
    ...base,
    description,
    openGraph: { type: 'profile', siteName: SITE_NAME, title, description, images },
    twitter: { card: 'summary', title, description, images },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
