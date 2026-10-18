'use client';

/* eslint-disable @next/next/no-img-element -- 皇冠是本地静态小图，不必过 next/image 优化器 */

import { Clock, LoaderCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type ReactNode } from 'react';

import Button from '@/app/components/ui/button';
import { queryStripeOrder } from '@/app/lib/stripe';
import {
  PLATFORM_ICONS,
  STRIPE_MEMBER_PRICE,
  STRIPE_POLL_INTERVAL_MS,
  STRIPE_POLL_MAX_ATTEMPTS,
} from '@/config/membership';

import PayDialogShell, { MemberPaidResult } from './PayDialogShell';

type ResultState = 'checking' | 'paid' | 'slow';

interface StripeResultDialogProps {
  /** 从收银台跳回时地址里带的订单号；没有时弹窗关闭 */
  orderId: string | null;
  /** 付款成功后的会员到期日，由页面重新取玩家信息后传回；还没取到时为 null */
  paidExpireDate: string | null;
  onPaid: () => void;
  onClose: () => void;
}

/**
 * 从 Stripe 收银台付完跳回后，轮询订单直到开通。跳回本身不代表到账，只有查到成功才显示已开通；
 * 等太久就停下，由玩家手动再查。
 */
export default function StripeResultDialog({
  orderId,
  paidExpireDate,
  onPaid,
  onClose,
}: StripeResultDialogProps) {
  const t = useTranslations('membership.stripePay');
  const tPay = useTranslations('membership.pay');
  const tMember = useTranslations('membership.member');
  const [state, setState] = useState<ResultState>('checking');
  // 递增后重新开始一轮轮询
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (!orderId || state !== 'checking') {
      return;
    }
    let stopped = false;
    let attempts = 0;
    const poll = async () => {
      attempts++;
      try {
        const { status } = await queryStripeOrder(orderId);
        if (stopped) {
          return;
        }
        if (status === 'SUCCESS') {
          stopped = true;
          window.clearInterval(timer);
          setState('paid');
          onPaid();
          return;
        }
      } catch {
        // 单次查询失败不打断，下一轮再查
      }
      if (!stopped && attempts >= STRIPE_POLL_MAX_ATTEMPTS) {
        stopped = true;
        window.clearInterval(timer);
        setState('slow');
      }
    };
    const timer = window.setInterval(poll, STRIPE_POLL_INTERVAL_MS);
    void poll();
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [orderId, state, round, onPaid]);

  const refresh = () => {
    setState('checking');
    setRound((value) => value + 1);
  };

  const subjectRow = (
    <div className="flex min-h-[42px] items-baseline justify-between gap-3">
      <span className="min-w-0 text-content">
        {tPay('memberSubject', { months: tMember('months', { count: 1 }) })}
      </span>
      <span className="text-[28px] font-extrabold whitespace-nowrap text-heading">
        US${STRIPE_MEMBER_PRICE}.00
      </span>
    </div>
  );

  const frame = (content: ReactNode) => (
    <div className="mx-auto flex size-[236px] flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed border-line-strong bg-panel-soft text-center">
      {content}
    </div>
  );

  const body = (() => {
    switch (state) {
      case 'checking':
        return (
          <>
            {subjectRow}
            {frame(
              <img
                src="/images/member/crown-grey.png"
                alt=""
                width={120}
                height={120}
                className="size-28 opacity-60"
              />,
            )}
            <div className="flex flex-col items-center gap-1 text-center">
              <span className="flex items-center gap-2 font-bold text-heading">
                <LoaderCircle className="size-4 animate-spin text-link" aria-hidden="true" />
                {t('checking')}
              </span>
              <span className="text-[13px] text-muted">{t('checkingHint')}</span>
            </div>
            <Button variant="secondary" className="w-full" onClick={onClose}>
              {tPay('close')}
            </Button>
          </>
        );
      case 'paid':
        return (
          <>
            <MemberPaidResult months={1} expireDate={paidExpireDate} />
            <Button className="w-full" onClick={onClose}>
              {tPay('done')}
            </Button>
          </>
        );
      case 'slow':
        return (
          <>
            {subjectRow}
            {frame(
              <>
                <Clock className="size-9 text-muted" aria-hidden="true" />
                <span className="font-bold text-heading">{t('slow.title')}</span>
              </>,
            )}
            <p className="text-center text-[13px] text-muted">{t('slow.hint')}</p>
            <Button className="w-full" onClick={refresh}>
              {t('refresh')}
            </Button>
            <Button variant="secondary" className="w-full" onClick={onClose}>
              {tPay('close')}
            </Button>
          </>
        );
    }
  })();

  return (
    <PayDialogShell
      open={orderId !== null}
      title={t('title')}
      icon={PLATFORM_ICONS.stripe}
      onClose={onClose}
    >
      {body}
    </PayDialogShell>
  );
}
