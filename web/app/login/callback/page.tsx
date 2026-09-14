'use client';

import { signInWithCustomToken } from 'firebase/auth';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';

import Button from '@/app/components/ui/button';
import Spinner from '@/app/components/ui/spinner';
import { ApiError, apiFetch } from '@/app/lib/api';
import { useAuth } from '@/app/lib/auth';
import { isSafeNextPath } from '@/app/lib/steam-login';
import { auth } from '@/config/firebase';

interface SteamVerifyResponse {
  customToken: string;
}

// 换登录态要连 Firebase，这一步在部分网络下不稳；退避重试能盖掉短暂抖动
const SIGN_IN_RETRY_DELAYS_MS = [400, 1200];

// 两种失败要分开：拿不到 token 只能重走 Steam，拿到了则手上的 token 还能再用一次
type Failure =
  | { stage: 'verify'; code: string }
  | { stage: 'signIn'; code: string; customToken: string };

function toErrorCode(error: unknown): string {
  if (error instanceof ApiError) {
    return `api/${error.status}`;
  }
  if (error instanceof Error && 'code' in error) {
    return String((error as { code: unknown }).code);
  }
  return 'unknown';
}

async function signInWithRetry(customToken: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await signInWithCustomToken(auth, customToken);
      return;
    } catch (error) {
      if (attempt >= SIGN_IN_RETRY_DELAYS_MS.length) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, SIGN_IN_RETRY_DELAYS_MS[attempt]));
    }
  }
}

function LoginCallbackContent() {
  const t = useTranslations('auth');
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loginUrl } = useAuth();
  const [failure, setFailure] = useState<Failure | null>(null);

  const nextParam = searchParams.get('next');
  const next = isSafeNextPath(nextParam) ? nextParam : '/';

  // openid 参数在 Steam 那边一次性有效，StrictMode 下的重复挂载不能重新发起请求，
  // 否则第二次核对必然被 Steam 判定为无效签名
  const hasRunRef = useRef(false);

  const signIn = useCallback(
    async (customToken: string) => {
      try {
        await signInWithRetry(customToken);
        router.replace(next);
      } catch (error) {
        console.error('[auth] 换取登录态失败', error);
        setFailure({ stage: 'signIn', code: toErrorCode(error), customToken });
      }
    },
    [next, router],
  );

  useEffect(() => {
    if (hasRunRef.current) {
      return;
    }
    hasRunRef.current = true;

    (async () => {
      let customToken: string;
      try {
        // 原样透传查询串给后端二次核对签名，见 SteamVerifyDto 的说明
        ({ customToken } = await apiFetch<SteamVerifyResponse>('/api/auth/steam/verify', {
          method: 'POST',
          body: JSON.stringify({ openidParams: `?${searchParams.toString()}` }),
        }));
      } catch (error) {
        console.error('[auth] Steam 回调核对失败', error);
        setFailure({ stage: 'verify', code: toErrorCode(error) });
        return;
      }
      await signIn(customToken);
    })();
    // 只在挂载时核对一次，next/searchParams 变化不用重跑
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (failure) {
    const retry =
      failure.stage === 'signIn'
        ? () => {
            setFailure(null);
            void signIn(failure.customToken);
          }
        : () => {
            window.location.href = loginUrl(next);
          };

    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center text-content">
        <p>{t('callbackError')}</p>
        <p className="text-sm text-muted">{t('errorCode', { code: failure.code })}</p>
        <Button variant="steam" onClick={retry}>
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
