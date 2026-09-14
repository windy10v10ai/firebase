'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

import LoginPanel from '@/app/components/LoginPanel';
import { useAuth } from '@/app/lib/auth';
import { playerPagePath } from '@/app/lib/player-path';

/**
 * 玩家页面的未登录入口，一个页面吃掉 `/my` 下的全部子路径。
 * 登录判断集中在这里，`/profile/<id>/*` 自己不写。
 */
export default function MyPage() {
  const auth = useAuth();
  const router = useRouter();
  const params = useParams<{ path?: string[] }>();

  const subPath = (params.path ?? []).join('/');
  const uid = auth.status === 'authenticated' ? auth.uid : null;

  useEffect(() => {
    if (uid) {
      // replace 而非 push：玩家按返回键不该退回这个中转页再跳一次
      router.replace(playerPagePath(uid, subPath));
    }
  }, [router, subPath, uid]);

  if (auth.status === 'unauthenticated') {
    return <LoginPanel />;
  }

  // 已登录只做跳转，中转页本身不渲染内容
  return null;
}
