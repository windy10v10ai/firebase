'use client';

/* eslint-disable @next/next/no-img-element -- 二维码是本地生成的 data URL，图标是本地静态小图，都不必过 next/image 优化器 */

import { Clock, LoaderCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import QRCode from 'qrcode';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import SteamLoginButton from '@/app/components/SteamLoginButton';
import Button from '@/app/components/ui/button';
import Skeleton from '@/app/components/ui/skeleton';
import { createAlipayOrder, queryAlipayOrder } from '@/app/lib/alipay';
import { ApiError } from '@/app/lib/api';
import {
  ALIPAY_POLL_INTERVAL_MS,
  PLATFORM_ICONS,
  type AlipayProductCode,
} from '@/config/membership';

import PayDialogShell, { MemberPaidResult, PointsPaidResult } from './PayDialogShell';

export type AlipayRequest =
  | { productCode: AlipayProductCode; quantity: number; kind: 'member'; months: number }
  | {
      productCode: AlipayProductCode;
      quantity: number;
      kind: 'points';
      points: number;
      image: string;
    };

type PayState =
  | { step: 'creating' }
  | { step: 'waiting'; outTradeNo: string; qrImage: string; totalAmount: string; expiresAt: number }
  | { step: 'paid' }
  | { step: 'expired' }
  | { step: 'failed' }
  | { step: 'rateLimited' };

/** 下单并把结果换成弹窗状态；不碰 React 状态，由调用方丢弃过期的回包 */
async function placeOrder(steamId: string, target: AlipayRequest): Promise<PayState> {
  try {
    const order = await createAlipayOrder(steamId, target.productCode, target.quantity);
    const qrImage = await QRCode.toDataURL(order.qrCode, { margin: 1, width: 440 });
    return {
      step: 'waiting',
      outTradeNo: order.outTradeNo,
      qrImage,
      totalAmount: order.totalAmount,
      expiresAt: Date.parse(order.expiresAt),
    };
  } catch (error) {
    // 下单次数到了当天上限时 API 回 400
    return { step: error instanceof ApiError && error.status === 400 ? 'rateLimited' : 'failed' };
  }
}

interface AlipayPayDialogProps {
  /** 未登录时为 null：不下单，弹窗里提示登录 */
  steamId: string | null;
  request: AlipayRequest | null;
  /** 付款成功后的会员到期日，由页面重新取玩家信息后传回；还没取到时为 null */
  paidExpireDate: string | null;
  onPaid: () => void;
  onClose: () => void;
}

/**
 * 支付宝扫码付款。弹窗开着时轮询订单，关掉就停；订单状态以服务端为准，前端只负责展示。
 * 每次打开由调用方换 key 重新挂载，状态从头开始。
 */
export default function AlipayPayDialog({
  steamId,
  request,
  paidExpireDate,
  onPaid,
  onClose,
}: AlipayPayDialogProps) {
  const t = useTranslations('membership.pay');
  const tMember = useTranslations('membership.member');
  const [state, setState] = useState<PayState>({ step: 'creating' });
  // 每次下单递增，关掉弹窗或重新生成后，旧请求的回包直接丢弃
  const attempt = useRef(0);

  // 进入「生成中」由调用方负责：打开弹窗时组件是新挂载的，初值就是它
  const settle = useCallback(
    (target: AlipayRequest) => {
      if (!steamId) {
        return;
      }
      const current = ++attempt.current;
      placeOrder(steamId, target).then((next) => {
        if (current === attempt.current) {
          setState(next);
        }
      });
    },
    [steamId],
  );

  useEffect(() => {
    if (!request) {
      attempt.current++;
      return;
    }
    settle(request);
  }, [request, settle]);

  const retry = (target: AlipayRequest) => {
    setState({ step: 'creating' });
    settle(target);
  };

  const outTradeNo = state.step === 'waiting' ? state.outTradeNo : null;
  const expiresAt = state.step === 'waiting' ? state.expiresAt : 0;

  useEffect(() => {
    if (!outTradeNo) {
      return;
    }
    let stopped = false;
    const timer = window.setInterval(async () => {
      // 支付宝到点自动关单，服务端这边不会改状态，只能由前端按到期时间收尾
      if (Date.now() >= expiresAt) {
        stopped = true;
        window.clearInterval(timer);
        setState({ step: 'expired' });
        return;
      }
      try {
        const { status } = await queryAlipayOrder(outTradeNo);
        if (stopped) {
          return;
        }
        if (status === 'SUCCESS') {
          stopped = true;
          window.clearInterval(timer);
          setState({ step: 'paid' });
          onPaid();
        } else if (status === 'CLOSED' || status === 'FAILED') {
          stopped = true;
          window.clearInterval(timer);
          setState({ step: 'expired' });
        }
      } catch {
        // 单次查询失败不打断，下一轮再查
      }
    }, ALIPAY_POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [outTradeNo, expiresAt, onPaid]);

  const subject = !request
    ? ''
    : request.kind === 'member'
      ? t('memberSubject', { months: tMember('months', { count: request.months }) })
      : t('pointsSubject', { points: request.points.toLocaleString() });

  // 金额以服务端算出的为准；还在下单时放骨架，下单没成功就不显示金额
  const subjectRow = (amount: string | null, pending: boolean) => (
    <div className="flex min-h-[42px] items-baseline justify-between gap-3">
      <span className="min-w-0 text-content">{subject}</span>
      <span className="text-[28px] font-extrabold whitespace-nowrap text-heading">
        {amount ? `¥${amount}` : pending ? <Skeleton>¥000.00</Skeleton> : null}
      </span>
    </div>
  );

  const qrFrame = (content: ReactNode, framed: boolean) => (
    <div
      className={`mx-auto flex size-[236px] items-center justify-center rounded-xl ${
        framed
          ? 'border-[3px] border-alipay bg-white p-3'
          : 'border border-dashed border-line-strong bg-panel-soft'
      }`}
    >
      {content}
    </div>
  );

  const body = (() => {
    if (!request) {
      return null;
    }
    if (!steamId) {
      return (
        <>
          {subjectRow(null, false)}
          <p className="text-center text-content">{t('loginHint')}</p>
          <div className="flex justify-center pb-2">
            <SteamLoginButton size="large" />
          </div>
        </>
      );
    }
    switch (state.step) {
      case 'creating':
      case 'waiting':
        return (
          <>
            {subjectRow(state.step === 'waiting' ? state.totalAmount : null, true)}
            {state.step === 'waiting'
              ? qrFrame(<img src={state.qrImage} alt={t('qrAlt')} className="size-full" />, true)
              : qrFrame(
                  <LoaderCircle className="size-8 animate-spin text-link" aria-hidden="true" />,
                  false,
                )}
            <div className="flex flex-col items-center gap-1 text-center">
              <span className="flex items-center gap-2 font-bold text-heading">
                <LoaderCircle className="size-4 animate-spin text-link" aria-hidden="true" />
                {state.step === 'waiting' ? t('waiting') : t('creating')}
              </span>
              <span className="hidden text-[13px] text-muted md:block">{t('waitingHint')}</span>
              <span className="text-[13px] text-muted md:hidden">{t('waitingHintMobile')}</span>
            </div>
            <Button variant="secondary" className="w-full" onClick={onClose}>
              {t('cancel')}
            </Button>
          </>
        );
      case 'paid':
        return (
          <>
            {request.kind === 'member' ? (
              <MemberPaidResult months={request.months} expireDate={paidExpireDate} />
            ) : (
              <PointsPaidResult points={request.points} image={request.image} />
            )}
            <Button className="w-full" onClick={onClose}>
              {t('done')}
            </Button>
          </>
        );
      case 'expired':
      case 'failed':
      case 'rateLimited': {
        const key = state.step;
        return (
          <>
            {subjectRow(null, false)}
            {qrFrame(
              <span className="flex flex-col items-center gap-2.5 text-center">
                <Clock className="size-9 text-muted" aria-hidden="true" />
                <span className="font-bold text-heading">{t(`${key}.title`)}</span>
              </span>,
              false,
            )}
            <p className="text-center text-[13px] text-muted">{t(`${key}.hint`)}</p>
            {key === 'rateLimited' ? null : (
              <Button className="w-full" onClick={() => retry(request)}>
                {t(`${key}.action`)}
              </Button>
            )}
            <Button variant="secondary" className="w-full" onClick={onClose}>
              {t('cancel')}
            </Button>
          </>
        );
      }
    }
  })();

  return (
    <PayDialogShell
      open={request !== null}
      title={t('title')}
      icon={PLATFORM_ICONS.alipay}
      onClose={onClose}
    >
      {body}
    </PayDialogShell>
  );
}
