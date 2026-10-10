'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { ApiError } from './api';
import { useAuth } from './auth';

/** 4xx 重试结果也不会变；5xx 与网络错误重试一次，挡偶发抖动 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status < 500) {
    return false;
  }
  return failureCount < 1;
}

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetry },
    },
  });
}

/** 换账号或退出时清空全部缓存：同一地址本人看与别人看的返回可能不同，公用电脑上也不该留给下一个人 */
export function clearOnAccountChange(client: QueryClient, previousUid: string | null, uid: string | null) {
  if (previousUid !== uid) {
    client.clear();
  }
}

function AccountWatcher({ client }: { client: QueryClient }) {
  const auth = useAuth();
  const uid = auth.status === 'authenticated' ? auth.uid : null;
  const previousUid = useRef(uid);

  useEffect(() => {
    clearOnAccountChange(client, previousUid.current, uid);
    previousUid.current = uid;
  }, [client, uid]);

  return null;
}

/** 必须放在 AuthProvider 里面，换账号时要读登录态 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient);
  return (
    <QueryClientProvider client={client}>
      <AccountWatcher client={client} />
      {children}
    </QueryClientProvider>
  );
}
