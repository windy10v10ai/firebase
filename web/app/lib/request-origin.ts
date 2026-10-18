import { headers } from 'next/headers';

/** 玩家实际访问的站点地址；同一份构建挂在多个域名下，回调与分享卡片的绝对地址要跟着它走 */
export async function requestOrigin(): Promise<string> {
  const headerList = await headers();
  const host = (headerList.get('x-forwarded-host') ?? headerList.get('host') ?? '')
    .split(',')[0]
    .trim();
  const isLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1');
  const proto =
    headerList.get('x-forwarded-proto')?.split(',')[0].trim() ?? (isLocal ? 'http' : 'https');
  return `${proto}://${host}`;
}
