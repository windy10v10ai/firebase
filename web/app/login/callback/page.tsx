'use client';

import { signInWithCustomToken } from 'firebase/auth';
import { Circle, CircleCheck, CircleX, LoaderCircle, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';

import Button from '@/app/components/ui/button';
import { trackEvent } from '@/app/lib/analytics';
import { ApiError, apiFetch } from '@/app/lib/api';
import { useAuth } from '@/app/lib/auth';
import { isSafeNextPath } from '@/app/lib/steam-login';
import { auth } from '@/config/firebase';

interface SteamVerifyResponse {
  customToken: string;
}

// 换登录态要连 Firebase，这一步在部分网络下不稳；退避重试能盖掉短暂抖动
const SIGN_IN_RETRY_DELAYS_MS = [400, 1200];
// 接口不响应时 fetch 会一直挂着，不设上限页面就只剩转圈，玩家截图里没有任何信息
const VERIFY_TIMEOUT_MS = 20_000;
// 正常登录一两秒就结束，过了这个时长才显示已等秒数
const SHOW_ELAPSED_AFTER_MS = 4_000;
// SDK 单个请求 30 秒才判超时，提前给出重试，不让玩家干等
const SHOW_RETRY_AFTER_MS = 15_000;
const STEAM_ID64_BASE = BigInt('76561197960265728');

const STEPS = ['verify', 'signIn', 'redirect'] as const;
type Stage = (typeof STEPS)[number];
type StepState = 'done' | 'active' | 'failed' | 'pending';

// 两种失败要分开：拿不到 token 只能重走 Steam，拿到了则手上的 token 还能再用一次
interface Failure {
  stage: Exclude<Stage, 'redirect'>;
  code: string;
  detail: 'timeout' | 'unreachable' | 'badResponse' | 'other' | null;
  attempts: number;
  elapsedMs: number;
  at: Date;
}

const STEP_ICON = {
  done: CircleCheck,
  active: LoaderCircle,
  failed: CircleX,
  pending: Circle,
} as const;

const STEP_ICON_CLASS: Record<StepState, string> = {
  done: 'text-success',
  active: 'animate-spin text-link',
  failed: 'text-danger',
  pending: 'text-[#3f3f46]',
};

const STEP_LABEL_CLASS: Record<StepState, string> = {
  done: 'text-content',
  active: 'font-medium text-heading',
  failed: 'font-medium text-heading',
  pending: 'text-muted',
};

function describeError(error: unknown): Pick<Failure, 'code' | 'detail'> {
  if (error instanceof ApiError) {
    return { code: `api/${error.status}`, detail: null };
  }
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return { code: 'timeout', detail: null };
  }
  if (error instanceof Error && 'code' in error) {
    const code = String((error as { code: unknown }).code);
    if (code !== 'auth/network-request-failed') {
      return { code, detail: null };
    }
    // SDK 把超时、连不上、响应解析失败报成同一个码，只有 customData.message 分得开：超时时它为空
    const message = (error as { customData?: { message?: string } }).customData?.message;
    if (!message) {
      return { code, detail: 'timeout' };
    }
    if (/failed to fetch|networkerror|load failed/i.test(message)) {
      return { code, detail: 'unreachable' };
    }
    if (/json|unexpected token/i.test(message)) {
      return { code, detail: 'badResponse' };
    }
    return { code, detail: 'other' };
  }
  // fetch 被拒时抛的是不带 code 的 TypeError：连不上接口或跨域失败
  if (error instanceof TypeError) {
    return { code: 'network', detail: null };
  }
  return { code: 'unknown', detail: null };
}

async function signInWithRetry(customToken: string, onRetry: (attempt: number) => void) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await signInWithCustomToken(auth, customToken);
      return;
    } catch (error) {
      if (attempt > SIGN_IN_RETRY_DELAYS_MS.length) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, SIGN_IN_RETRY_DELAYS_MS[attempt - 1]));
      onRetry(attempt + 1);
    }
  }
}

// 回调参数里带着 Steam 的 64 位 ID，换算成 Dota2 ID 才能对上生产日志；只用于显示，不做校验
function accountIdFrom(claimedId: string | null): string | null {
  const id64 = claimedId?.match(/\/(\d+)$/)?.[1];
  return id64 ? String(BigInt(id64) - STEAM_ID64_BASE) : null;
}

// 玩家截图发来时要能换算成日志里的 UTC 时间，所以带上时区
function formatWithZone(date: Date, locale: string): string {
  const offset = -date.getTimezoneOffset();
  const hours = Math.floor(Math.abs(offset) / 60);
  const minutes = Math.abs(offset) % 60;
  const zone = `UTC${offset >= 0 ? '+' : '-'}${hours}${minutes ? `:${String(minutes).padStart(2, '0')}` : ''}`;
  return `${date.toLocaleString(locale, { hour12: false })} (${zone})`;
}

function stepState(step: Stage, current: Stage, failed: boolean): StepState {
  const order = STEPS.indexOf(step);
  const currentOrder = STEPS.indexOf(current);
  if (order < currentOrder) {
    return 'done';
  }
  if (order > currentOrder) {
    return 'pending';
  }
  return failed ? 'failed' : 'active';
}

function LoginCallbackContent() {
  const t = useTranslations('auth.callback');
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loginUrl } = useAuth();

  const nextParam = searchParams.get('next');
  const next = isSafeNextPath(nextParam) ? nextParam : '/';
  const accountId = accountIdFrom(searchParams.get('openid.claimed_id'));

  const [stage, setStage] = useState<Stage>('verify');
  const [attempt, setAttempt] = useState(1);
  const [stageElapsedMs, setStageElapsedMs] = useState(0);
  const [hasToken, setHasToken] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  const startedAtRef = useRef(0);
  const stageStartedAtRef = useRef(0);
  const customTokenRef = useRef<string | null>(null);
  // 等待中点「再试一次」会并行开出新一轮，旧一轮随后失败时不能盖掉新一轮的进度
  const runRef = useRef(0);
  // openid 参数在 Steam 那边一次性有效，StrictMode 下的重复挂载不能重新发起请求，
  // 否则第二次核对必然被 Steam 判定为无效签名
  const hasRunRef = useRef(false);

  const enterStage = useCallback((nextStage: Stage) => {
    stageStartedAtRef.current = Date.now();
    setStage(nextStage);
    setAttempt(1);
    setStageElapsedMs(0);
  }, []);

  const signIn = useCallback(
    async (customToken: string) => {
      runRef.current += 1;
      const run = runRef.current;
      setFailure(null);
      enterStage('signIn');
      let attempts = 1;
      try {
        await signInWithRetry(customToken, (nextAttempt) => {
          attempts = nextAttempt;
          if (runRef.current === run) {
            setAttempt(nextAttempt);
          }
        });
        trackEvent('login', { method: 'steam' });
        enterStage('redirect');
        router.replace(next);
      } catch (error) {
        console.error('[auth] 换取登录态失败', error);
        if (runRef.current !== run) {
          return;
        }
        setFailure({
          stage: 'signIn',
          ...describeError(error),
          attempts,
          elapsedMs: Date.now() - startedAtRef.current,
          at: new Date(),
        });
      }
    },
    [enterStage, next, router],
  );

  useEffect(() => {
    if (hasRunRef.current) {
      return;
    }
    hasRunRef.current = true;
    startedAtRef.current = Date.now();
    stageStartedAtRef.current = startedAtRef.current;

    (async () => {
      let customToken: string;
      try {
        // 原样透传查询串给后端二次核对签名，见 SteamVerifyDto 的说明
        ({ customToken } = await apiFetch<SteamVerifyResponse>('/api/auth/steam/verify', {
          method: 'POST',
          body: JSON.stringify({ openidParams: `?${searchParams.toString()}` }),
          signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
        }));
      } catch (error) {
        console.error('[auth] Steam 回调核对失败', error);
        setFailure({
          stage: 'verify',
          ...describeError(error),
          attempts: 1,
          elapsedMs: Date.now() - startedAtRef.current,
          at: new Date(),
        });
        return;
      }
      customTokenRef.current = customToken;
      setHasToken(true);
      await signIn(customToken);
    })();
    // 只在挂载时核对一次，next/searchParams 变化不用重跑
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 失败后停表，截图里的秒数停在出错那一刻
  useEffect(() => {
    if (failure) {
      return;
    }
    const timer = setInterval(() => setStageElapsedMs(Date.now() - stageStartedAtRef.current), 1000);
    return () => clearInterval(timer);
  }, [failure]);

  const retry = () => {
    if (customTokenRef.current) {
      void signIn(customTokenRef.current);
    } else {
      window.location.href = loginUrl(next);
    }
  };
  const retryLabel = hasToken ? t('retry') : t('relogin');
  const waiting = !failure && stage !== 'redirect';

  return (
    <section className="card-container card-pad mx-auto max-w-xl space-y-5" aria-live="polite">
      <span className="flex size-12 items-center justify-center rounded-full border border-line bg-panel-soft">
        {failure ? (
          <TriangleAlert className="size-6 text-warning" aria-hidden="true" />
        ) : (
          <LoaderCircle className="size-6 animate-spin text-link" aria-hidden="true" />
        )}
      </span>

      <div className="space-y-2">
        <h1 className="title-primary">{t(failure ? 'failTitle' : 'title')}</h1>
        <p className="text-content">
          {t(failure ? (failure.stage === 'signIn' ? 'failSignIn' : 'failVerify') : 'description')}
        </p>
      </div>

      <ol className="space-y-2.5 text-sm">
        {STEPS.map((step) => {
          const state = stepState(step, stage, failure !== null);
          const Icon = STEP_ICON[state];
          return (
            <li key={step} className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <Icon className={`size-[18px] shrink-0 ${STEP_ICON_CLASS[state]}`} aria-hidden="true" />
              <span className={STEP_LABEL_CLASS[state]}>{t(`steps.${step}`)}</span>
              {state === 'active' && waiting && stageElapsedMs >= SHOW_ELAPSED_AFTER_MS ? (
                <span className="text-muted">
                  · {t('waited', { seconds: Math.floor(stageElapsedMs / 1000) })}
                  {attempt > 1 ? ` · ${t('attempt', { attempt })}` : null}
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>

      {failure ? (
        <>
          <div className="space-y-1.5">
            <div className="rounded-[7px] border border-line bg-panel-soft px-3 py-2.5 font-mono text-[13px] leading-5 text-[#a1a1aa] select-all">
              <p>
                {t('diag.stuckAt', {
                  step: STEPS.indexOf(failure.stage) + 1,
                  name: t(`steps.${failure.stage}`),
                })}
              </p>
              <p>
                {failure.code}
                {failure.detail ? ` · ${t(`diag.detail.${failure.detail}`)}` : null}
              </p>
              <p>
                {t('diag.attempts', {
                  attempts: failure.attempts,
                  seconds: Math.round(failure.elapsedMs / 1000),
                })}
              </p>
              <p>
                {formatWithZone(failure.at, locale)}
                {accountId ? ` · ${t('diag.player', { id: accountId })}` : null}
              </p>
            </div>
            <p className="text-xs text-muted">{t('diag.hint')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={retry}>{retryLabel}</Button>
            <Link href="/" className="btn-ghost">
              {t('home')}
            </Link>
          </div>
        </>
      ) : waiting && stageElapsedMs >= SHOW_RETRY_AFTER_MS ? (
        <Button variant="secondary" onClick={retry}>
          {retryLabel}
        </Button>
      ) : null}
    </section>
  );
}

export default function LoginCallbackPage() {
  return (
    <Suspense fallback={null}>
      <LoginCallbackContent />
    </Suspense>
  );
}
