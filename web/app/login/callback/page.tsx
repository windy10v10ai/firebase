'use client';

import { signInWithCustomToken } from 'firebase/auth';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useEffect, useState } from 'react';

import Button from '@/app/components/ui/button';
import Spinner from '@/app/components/ui/spinner';
import { apiFetch } from '@/app/lib/api';
import { buildSteamLoginUrl, isSafeNextPath } from '@/app/lib/steam-login';
import { auth } from '@/config/firebase';

interface SteamVerifyResponse {
  customToken: string;
}

function LoginCallbackContent() {
  const t = useTranslations('auth');
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState(false);

  const nextParam = searchParams.get('next');
  const next = isSafeNextPath(nextParam) ? nextParam : '/';

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // 原样透传查询串给后端二次核对签名，见 SteamVerifyDto 的说明
        const { customToken } = await apiFetch<SteamVerifyResponse>('/api/auth/steam/verify', {
          method: 'POST',
          body: JSON.stringify({ openidParams: `?${searchParams.toString()}` }),
        });
        await signInWithCustomToken(auth, customToken);
        if (!cancelled) {
          router.replace(next);
        }
      } catch {
        if (!cancelled) {
          setError(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // 只在挂载时核对一次，openid 参数是一次性的，next/searchParams 变化不用重跑
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center text-content">
        <p>{t('callbackError')}</p>
        <Button onClick={() => (window.location.href = buildSteamLoginUrl(next))}>
          {t('retry')}
        </Button>
      </div>
    );
  }

  return <Spinner label={t('callbackLoading')} />;
}

export default function LoginCallbackPage() {
  return (
    <Suspense fallback={null}>
      <LoginCallbackContent />
    </Suspense>
  );
}
