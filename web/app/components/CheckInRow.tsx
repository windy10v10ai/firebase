'use client';

import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import Button from '@/app/components/ui/button';
import { claimCheckIn, type CheckInPoints, type PlayerInfo } from '@/app/lib/player-info';

interface CheckInRowProps {
  info: PlayerInfo | null;
  steamId: string;
  onClaimed: (player: PlayerInfo) => void;
}

/** 首页与个人主页共用的签到入口，数据没到或不是有效会员时整行不渲染 */
export default function CheckInRow({ info, steamId, onClaimed }: CheckInRowProps) {
  const t = useTranslations('checkIn');
  const [pending, setPending] = useState(false);
  const [claimed, setClaimed] = useState<CheckInPoints | null>(null);
  const [failed, setFailed] = useState(false);

  const status = info?.checkIn?.memberPoint;
  if (!info?.member?.enable || !status) {
    return null;
  }

  const signed = claimed !== null || status.dailyPoint === 0;
  const available = status.dailyPoint + status.catchUpPoint;

  const onClick = async () => {
    setPending(true);
    setFailed(false);
    try {
      const result = await claimCheckIn(steamId);
      setClaimed(result.memberPoint);
      onClaimed(result.player);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  };

  const subText = signed
    ? t('nextTime')
    : status.catchUpDays > 0
      ? t('availableWithCatchUp', { days: status.catchUpDays, amount: available })
      : t('available', { amount: available });

  return (
    <div className="space-y-3 border-t border-line pt-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-content">{t('title')}</div>
          <div className="mt-0.5 text-sm text-muted">{subText}</div>
        </div>
        {signed ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-success">
            <Check className="size-4" aria-hidden="true" />
            {t('done')}
          </span>
        ) : (
          <Button onClick={onClick} loading={pending} className="shrink-0">
            {pending ? t('pending') : t('action')}
          </Button>
        )}
      </div>

      {/* 明细只在本次签到之后出现：签到日推进后补了几天已经无法还原，刷新即消失 */}
      {claimed && claimed.dailyPoint + claimed.catchUpPoint > 0 ? (
        <div className="box-pad space-y-1.5 rounded-[7px] border-l-2 border-member-border bg-panel-soft">
          {claimed.dailyPoint > 0 ? (
            <DetailRow label={t('detailDaily')} amount={claimed.dailyPoint} />
          ) : null}
          {claimed.catchUpDays > 0 ? (
            <DetailRow
              label={t('detailCatchUp', { days: claimed.catchUpDays })}
              amount={claimed.catchUpPoint}
            />
          ) : null}
          <p className="text-xs text-muted">{t('detailNote')}</p>
        </div>
      ) : null}

      {failed ? <p className="text-sm text-danger">{t('failed')}</p> : null}
    </div>
  );
}

function DetailRow({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm text-content">
      <span>{label}</span>
      <span className="font-bold text-member">+{amount.toLocaleString()}</span>
    </div>
  );
}
