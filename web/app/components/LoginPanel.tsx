'use client';

import { useTranslations } from 'next-intl';

import Notice from './Notice';
import SteamLoginButton from './SteamLoginButton';

const POINT_KEYS = ['why', 'scope', 'safety'] as const;

/** 未登录时替换玩家页面的正文，地址栏停在玩家本来要去的页面 */
export default function LoginPanel() {
  const t = useTranslations('auth.panel');

  return (
    <Notice title={t('title')}>
      <ul className="space-y-3 text-content">
        {POINT_KEYS.map((key) => (
          <li key={key}>{t(key)}</li>
        ))}
      </ul>
      <SteamLoginButton size="large" />
    </Notice>
  );
}
