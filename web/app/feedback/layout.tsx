import { NO_INDEX, pageTitle } from '@/app/lib/page-title';

import type { Metadata } from 'next';

const feedbackTitle = pageTitle('navigation', 'feedback');

// 页面本身是客户端组件，导不出 metadata
export async function generateMetadata(): Promise<Metadata> {
  return { ...(await feedbackTitle()), ...NO_INDEX };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
