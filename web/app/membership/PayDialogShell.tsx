'use client';

/* eslint-disable @next/next/no-img-element -- 平台图标与皇冠是本地静态小图，不必过 next/image 优化器 */

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useLayoutEffect, useRef, type ReactNode } from 'react';

import Skeleton from '@/app/components/ui/skeleton';

interface PayDialogShellProps {
  open: boolean;
  title: string;
  icon: string;
  onClose: () => void;
  children: ReactNode;
}

/** 付款弹窗的外框：手机是贴底的抽屉，平板起居中，和觉醒详情弹窗同一套外形。 */
export default function PayDialogShell({
  open,
  title,
  icon,
  onClose,
  children,
}: PayDialogShellProps) {
  const t = useTranslations('membership.pay');
  const ref = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(event) => {
        // 点遮罩关闭：事件落在 dialog 本身而不是里面的内容时才算点在遮罩上
        if (event.target === ref.current) {
          onClose();
        }
      }}
      aria-label={title}
      className="card-container m-0 mt-auto max-h-[calc(100dvh-3rem)] w-full max-w-none rounded-t-[14px] rounded-b-none border-b-0 p-0 text-content backdrop:bg-black/60 open:flex open:flex-col md:m-auto md:w-[min(26rem,calc(100vw-2rem))] md:rounded-[10px] md:border-b"
    >
      {open ? (
        <div className="card-pad relative flex flex-col gap-4 overflow-y-auto pt-6 lg:pt-8">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-2 left-1/2 h-1 w-9 -translate-x-1/2 rounded-full bg-line-strong md:hidden"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="absolute top-3 right-3 flex size-11 items-center justify-center rounded-[7px] text-muted transition-colors hover:bg-panel-soft hover:text-heading lg:top-5 lg:right-5 lg:size-9"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
          <div className="flex items-center gap-2.5 pe-10">
            <img src={icon} alt="" width={24} height={24} className="size-6 rounded-md" />
            <h2 className="text-base font-bold text-heading">{title}</h2>
          </div>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}

/** 会员开通成功：金皇冠、月数与新的有效期；有效期由页面重新取会员信息后传入，没到时放骨架 */
export function MemberPaidResult({
  months,
  expireDate,
}: {
  months: number;
  expireDate: string | null;
}) {
  const t = useTranslations('membership.pay');
  const tMember = useTranslations('membership.member');
  return (
    <div className="flex flex-col items-center gap-3.5 py-4 text-center">
      <img
        src="/images/member/crown-gold.png"
        alt=""
        width={120}
        height={120}
        className="size-28"
      />
      <p className="text-2xl font-extrabold text-heading">
        {t.rich('memberPaid', {
          months: tMember('months', { count: months }),
          em: (chunks) => <span className="text-member-strong">{chunks}</span>,
        })}
      </p>
      <p className="flex items-baseline gap-2 text-member">
        <span>{t('paidExpire')}</span>
        <span className="text-xl font-extrabold">
          {expireDate ?? <Skeleton>0000-00-00</Skeleton>}
        </span>
      </p>
    </div>
  );
}
