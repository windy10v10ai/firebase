'use client';

import { useTranslations } from 'next-intl';

import { useAuth } from '@/app/lib/auth';

import Notice from './Notice';
import SteamLoginButton from './SteamLoginButton';

/** 玩家关闭了公开时访客看到的说明；没登录时可能就是本人，给一个登录入口 */
export default function PrivateProfileNotice() {
  const t = useTranslations('profile.private');
  const auth = useAuth();

  return (
    <Notice title={t('title')}>
      <p className="text-content">{t('description')}</p>
      {auth.status === 'unauthenticated' ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <span className="text-sm text-muted">{t('ownerHint')}</span>
          <SteamLoginButton />
        </div>
      ) : null}
    </Notice>
  );
}
