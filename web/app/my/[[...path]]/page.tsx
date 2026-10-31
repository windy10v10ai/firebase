'use client';

import { Trophy } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

import ActionCard from '@/app/components/ActionCard';
import LoginPanel from '@/app/components/LoginPanel';
import { useAuth } from '@/app/lib/auth';
import { playerPagePath } from '@/app/lib/player-path';

import AwakenPreview from '../AwakenPreview';
import PropertyPreview from '../PropertyPreview';

/**
 * 玩家页面的未登录入口，一个页面吃掉 `/my` 下的全部子路径。
 * 登录判断集中在这里，`/profile/<id>/*` 自己不写。
 */
export default function MyPage() {
  const auth = useAuth();
  const router = useRouter();
  const params = useParams<{ path?: string[] }>();
  const t = useTranslations('auth.guest');

  const subPath = (params.path ?? []).join('/');
  const uid = auth.status === 'authenticated' ? auth.uid : null;

  useEffect(() => {
    if (uid) {
      // replace 而非 push：玩家按返回键不该退回这个中转页再跳一次
      router.replace(playerPagePath(uid, subPath));
    }
  }, [router, subPath, uid]);

  // 已登录只做跳转，中转页本身不渲染内容
  if (uid) {
    return null;
  }

  // 属性与觉醒的内容是全体玩家共用的配置，没登录也能先看
  if (subPath === 'property') {
    return <PropertyPreview />;
  }
  if (subPath === 'awaken') {
    return <AwakenPreview />;
  }
  if (subPath === '') {
    return (
      <div className="space-y-6">
        <LoginPanel />
        <div className="mx-auto max-w-xl">
          <ActionCard
            href="/leaderboard"
            Icon={Trophy}
            iconClassName="text-season"
            tileClassName="bg-season-soft"
            title={t('leaderboard.title')}
            description={t('leaderboard.description')}
            hoverClassName="hover:border-season-border"
          />
        </div>
      </div>
    );
  }
  return <LoginPanel />;
}
