'use client';

import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import Button from '@/app/components/ui/button';
import Skeleton from '@/app/components/ui/skeleton';
import { ApiError } from '@/app/lib/api';
import { claimCompensation, isCompensationOpen, type PlayerInfo } from '@/app/lib/player-info';

interface CompensationRowProps {
  info: PlayerInfo | null;
  steamId: string;
  onClaimed: (player: PlayerInfo) => void;
  buttonVariant?: 'primary' | 'cta';
}

/** 首页与个人主页共用的补偿领取入口，领取期外整行不渲染 */
export default function CompensationRow({
  info,
  steamId,
  onClaimed,
  buttonVariant = 'primary',
}: CompensationRowProps) {
  const t = useTranslations('compensation');
  const [pending, setPending] = useState(false);
  const [claimedNow, setClaimedNow] = useState(false);
  const [failed, setFailed] = useState(false);

  // 数据到了却没有补偿状态，说明接口已经判定领取期结束，以接口为准
  if (!isCompensationOpen() || (info && !info.compensation)) {
    return null;
  }

  const status = info?.compensation;
  const claimed = claimedNow || Boolean(status?.claimed);

  const onClick = async () => {
    setPending(true);
    setFailed(false);
    try {
      const player = await claimCompensation(steamId);
      setClaimedNow(true);
      onClaimed(player);
    } catch (error) {
      // 另一个标签页先领了：接口回已领取，这里照已领取显示，不当成失败
      if (error instanceof ApiError && error.status === 409) {
        onClaimed({ ...info!, compensation: { ...status!, claimed: true } });
      } else {
        setFailed(true);
      }
    } finally {
      setPending(false);
    }
  };

  const subText = claimedNow
    ? t('arrived')
    : claimed
      ? t('oncePerAccount')
      : t.rich('available', {
          amount: status?.seasonPoint ?? 0,
          points: (chunks) => <span className="font-bold text-season-light">{chunks}</span>,
        });

  return (
    <div className="@container space-y-3 border-t border-line pt-4">
      <div className="flex flex-col gap-3 @sm:flex-row @sm:items-center @sm:justify-between @sm:gap-4">
        <div className="min-w-0">
          <div className="text-content">{t('title')}</div>
          <div className="mt-0.5 text-sm text-muted">{status ? subText : <Skeleton />}</div>
        </div>
        {!status ? (
          <span className="flex min-h-11 shrink-0 items-center lg:min-h-10">
            <Skeleton>{t('action')}</Skeleton>
          </span>
        ) : claimed ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-success">
            <Check className="size-4" aria-hidden="true" />
            {t('done')}
          </span>
        ) : (
          <Button
            variant={buttonVariant}
            onClick={onClick}
            loading={pending}
            className="w-full shrink-0 @sm:w-auto"
          >
            {pending ? t('pending') : t('action')}
          </Button>
        )}
      </div>

      {claimedNow && status ? (
        <div className="box-pad flex items-baseline justify-between gap-4 rounded-[7px] border-l-2 border-season-border bg-panel-soft text-sm text-content">
          <span>{t('detail')}</span>
          <span className="font-bold text-season-light">
            +{status.seasonPoint.toLocaleString()}
          </span>
        </div>
      ) : null}

      {failed ? <p className="text-sm text-danger">{t('failed')}</p> : null}
    </div>
  );
}
