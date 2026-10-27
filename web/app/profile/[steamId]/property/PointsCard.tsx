'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import Skeleton from '@/app/components/ui/skeleton';
import { playerPagePath } from '@/app/lib/player-path';

/** 数值为 null 表示数据还没到 */
interface PointsCardProps {
  steamId: string;
  /** 本人看：扣掉待提交的档数之后还剩多少；别人看：已经加了多少 */
  usableLevel: number | null;
  /** 别人看时不显示待提交的提示 */
  readOnly: boolean;
  totalLevel: number | null;
  seasonLevel: number | null;
  memberLevel: number | null;
  /** 已选还没提交的属性点 */
  stagedPoints: number;
}

// 等级入口是跳个人主页的小标签，悬停描边随货币色：会员用金边，紫只代表勇士
const CHIP_CLASS =
  'group inline-flex min-h-11 items-baseline gap-1.5 rounded-lg border border-line bg-control px-3 py-2.5 text-sm text-muted transition-colors hover:bg-control-hover hover:text-content lg:min-h-9 lg:py-1.5';

export default function PointsCard({
  steamId,
  usableLevel,
  totalLevel,
  seasonLevel,
  memberLevel,
  readOnly,
  stagedPoints,
}: PointsCardProps) {
  const t = useTranslations('property.points');
  const profileHref = playerPagePath(steamId);

  return (
    // 吸在头部下面，底色不透明，往下滚的属性行不会从缝里透出来
    <section
      aria-label={t('title')}
      className="sticky top-[calc(var(--header-height)+0.5rem)] z-10 -mx-1 bg-surface px-1 pb-2 before:absolute before:inset-x-0 before:-top-2 before:h-2 before:bg-surface"
    >
      <div className="card-container flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5">
        <span className="flex items-baseline gap-2.5 whitespace-nowrap">
          <span className="text-content">{t(readOnly ? 'usedLabel' : 'usableLabel')}</span>
          {/* 加载中用一整块代替「可用 / 总数」，宽度与常见数值相当，标签不会因此换行 */}
          {usableLevel === null ? (
            <span className="text-3xl leading-none font-extrabold">
              <Skeleton>00</Skeleton>
            </span>
          ) : (
            <>
              <span className="text-3xl leading-none font-extrabold text-heading tabular-nums">
                {usableLevel}
              </span>
              <span className="font-bold text-muted tabular-nums">/ {totalLevel}</span>
            </>
          )}
        </span>

        <span className="flex flex-wrap items-center gap-2">
          <Link href={profileHref} className={`${CHIP_CLASS} hover:border-season-border`}>
            {t('battleLevel')}
            <b className="text-base font-bold text-season tabular-nums">
              {seasonLevel ?? <Skeleton>00</Skeleton>}
            </b>
          </Link>
          <Link href={profileHref} className={`${CHIP_CLASS} hover:border-member-border`}>
            {t('memberLevel')}
            <b className="text-base font-bold text-member-strong tabular-nums">
              {memberLevel ?? <Skeleton>00</Skeleton>}
            </b>
          </Link>
        </span>

        {!readOnly && stagedPoints > 0 ? (
          <span className="ml-auto min-w-0 text-[13px] text-season-light">
            {t('staged', { count: stagedPoints })}
          </span>
        ) : null}
      </div>
    </section>
  );
}
