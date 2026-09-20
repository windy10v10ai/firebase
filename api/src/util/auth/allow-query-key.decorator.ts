import { SetMetadata } from '@nestjs/common';

export const ALLOW_QUERY_KEY_KEY = 'allowQueryKey';
// 网页控件（DOTAHTMLPanel）带不了请求头，代理路由改从 query 的 apiKey 读取
export const AllowQueryKey = () => SetMetadata(ALLOW_QUERY_KEY_KEY, true);
