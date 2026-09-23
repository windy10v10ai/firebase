import { pageTitle } from '@/app/lib/page-title';

// 页面本身是客户端组件，导不出 metadata
export const generateMetadata = pageTitle('manualActive', 'afdianTitle');

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
