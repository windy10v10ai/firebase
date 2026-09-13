'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

import {
  RESET_PROPERTY_MEMBER_POINT_COST,
  RESET_PROPERTY_SEASON_POINT_COST,
} from '@/app/lib/player-info';

interface ResetDialogProps {
  open: boolean;
  busy: boolean;
  useableSeasonPoint: number;
  useableMemberPoint: number;
  onClose: () => void;
  onConfirm: (useMemberPoint: boolean) => void;
}

export default function ResetDialog({
  open,
  busy,
  useableSeasonPoint,
  useableMemberPoint,
  onClose,
  onConfirm,
}: ResetDialogProps) {
  const t = useTranslations('property.reset');
  const ref = useRef<HTMLDialogElement>(null);

  // 用原生 dialog 拿到焦点陷阱和 Esc 关闭，开关状态还是由 React 说了算
  useEffect(() => {
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

  const seasonShort = RESET_PROPERTY_SEASON_POINT_COST - useableSeasonPoint;
  const memberShort = RESET_PROPERTY_MEMBER_POINT_COST - useableMemberPoint;

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
      className="card-container m-auto w-[min(28rem,calc(100vw-2rem))] p-0 text-content backdrop:bg-black/60"
    >
      <div className="flex flex-col gap-5 p-6">
        <div className="flex flex-col gap-2.5">
          <h2 className="title-secondary">{t('title')}</h2>
          <p className="leading-relaxed text-content">{t('description')}</p>
        </div>
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            disabled={busy || seasonShort > 0}
            onClick={() => onConfirm(false)}
            className="btn-season w-full"
          >
            {t('useBattle', { cost: RESET_PROPERTY_SEASON_POINT_COST })}
          </button>
          {seasonShort > 0 ? (
            <p className="text-sm text-muted">
              {t('battleShort', {
                have: useableSeasonPoint.toLocaleString(),
                need: seasonShort.toLocaleString(),
              })}
            </p>
          ) : null}
          <button
            type="button"
            disabled={busy || memberShort > 0}
            onClick={() => onConfirm(true)}
            className="btn-member w-full"
          >
            {t('useMember', { cost: RESET_PROPERTY_MEMBER_POINT_COST })}
          </button>
          {memberShort > 0 ? (
            <p className="text-sm text-muted">
              {t('memberShort', {
                have: useableMemberPoint.toLocaleString(),
                need: memberShort.toLocaleString(),
              })}
            </p>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="min-h-11 rounded-[7px] border border-line bg-control text-sm text-content transition-colors hover:bg-control-hover"
          >
            {t('cancel')}
          </button>
        </div>
      </div>
    </dialog>
  );
}
