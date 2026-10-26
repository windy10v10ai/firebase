'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';

import LoginPanel from '@/app/components/LoginPanel';
import Notice from '@/app/components/Notice';
import OwnerBackLink from '@/app/components/OwnerBackLink';
import PrivateProfileNotice from '@/app/components/PrivateProfileNotice';
import Skeleton from '@/app/components/ui/skeleton';
import { ApiError } from '@/app/lib/api';
import { useIsSelf } from '@/app/lib/auth';
import { resetProperties, upgradeProperty, type PlayerInfo } from '@/app/lib/player-info';
import { applyPlayerWrite, playerPropertiesQuery } from '@/app/lib/queries';
import {
  PROPERTY_GROUPS,
  PROPERTY_LIST,
  PROPERTY_MAX_LEVEL,
  type PropertyDef,
} from '@/config/properties';

import PointsCard from './PointsCard';
import PropertyCard from './PropertyCard';
import ResetDialog from './ResetDialog';

type LoadResult = { status: 'failed'; httpStatus: number } | { status: 'ready'; info: PlayerInfo };

const FAILURE_KEY: Record<number, string> = {
  404: 'noRecord',
};

const RESET_KEY = 'reset';

export default function PropertyPage() {
  const t = useTranslations('property');
  const { steamId } = useParams<{ steamId: string }>();
  const isSelf = useIsSelf(steamId);

  const queryClient = useQueryClient();
  const query = useQuery(playerPropertiesQuery(steamId));
  // 属性名 → 还没提交的档数
  const [pending, setPending] = useState<Record<string, number>>({});
  // 正在提交的属性名，或 RESET_KEY；同一时刻只允许一个请求在飞
  const [busy, setBusy] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [failedAction, setFailedAction] = useState<string | null>(null);

  const loaded: LoadResult | null = query.data
    ? { status: 'ready', info: query.data }
    : query.isError
      ? { status: 'failed', httpStatus: query.error instanceof ApiError ? query.error.status : 0 }
      : null;

  /** 请求失败后重新拉一次，免得界面停在已经不成立的数值上 */
  const resync = useCallback(async () => {
    // 连重新拉取都失败时保留原来的画面，错误提示已经给过了
    await queryClient.refetchQueries({ queryKey: playerPropertiesQuery(steamId).queryKey });
    setPending({});
  }, [queryClient, steamId]);

  const handleUpgrade = useCallback(
    async (def: PropertyDef, targetLevel: number) => {
      setBusy(def.name);
      setFailedAction(null);
      try {
        const info = await upgradeProperty(steamId, def.name, targetLevel);
        void applyPlayerWrite(queryClient, steamId, playerPropertiesQuery(steamId).queryKey, info);
        setPending((current) => {
          const next = { ...current };
          delete next[def.name];
          return next;
        });
      } catch {
        setFailedAction('upgrade');
        await resync();
      } finally {
        setBusy(null);
      }
    },
    [queryClient, resync, steamId],
  );

  const handleReset = useCallback(
    async (useMemberPoint: boolean) => {
      setBusy(RESET_KEY);
      setFailedAction(null);
      try {
        const info = await resetProperties(steamId, useMemberPoint);
        void applyPlayerWrite(queryClient, steamId, playerPropertiesQuery(steamId).queryKey, info);
        setPending({});
        setDialogOpen(false);
      } catch {
        setFailedAction(RESET_KEY);
        setDialogOpen(false);
        await resync();
      } finally {
        setBusy(null);
      }
    },
    [queryClient, resync, steamId],
  );

  if (loaded?.status === 'failed') {
    // 页面不判断登录，看得到看不到由接口说了算
    if (loaded.httpStatus === 401) {
      return <LoginPanel />;
    }
    if (loaded.httpStatus === 403) {
      return <PrivateProfileNotice />;
    }
    const key = FAILURE_KEY[loaded.httpStatus] ?? 'failed';
    return (
      <Notice title={t(`${key}.title`)}>
        <p className="text-content">{t(`${key}.description`)}</p>
      </Notice>
    );
  }

  const info = loaded?.info ?? null;
  const levelOf = (name: string) =>
    info ? (info.properties?.find((property) => property.name === name)?.level ?? 0) : null;

  const stagedLevels = PROPERTY_LIST.reduce(
    (sum, def) => sum + (pending[def.name] ?? 0) * def.levelPerStep,
    0,
  );
  const usableLevel = info ? info.useableLevel - stagedLevels : null;

  return (
    <div className="space-y-6" aria-busy={!info}>
      {info ? null : (
        <p role="status" className="sr-only">
          {t('loading')}
        </p>
      )}
      <div className="space-y-1.5">
        {isSelf ? null : <OwnerBackLink steamId={steamId} />}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5">
          <h1 className="title-primary md:col-start-1">{t('title')}</h1>
          {isSelf ? (
            <button
              type="button"
              onClick={() => {
                if (info) {
                  setDialogOpen(true);
                }
              }}
              className="col-start-2 row-start-1 flex min-h-11 items-center gap-2 rounded-[7px] border border-danger/50 bg-danger/8 px-4 text-sm text-danger transition-colors hover:bg-danger/15 md:row-span-2 md:self-start"
            >
              <RotateCcw className="size-4" />
              {t('reset.button')}
            </button>
          ) : null}
          <p className="col-span-2 text-sm text-muted md:col-span-1">{t('intro')}</p>
        </div>
      </div>

      <PointsCard
        steamId={steamId}
        readOnly={!isSelf}
        usableLevel={isSelf ? usableLevel : info ? (info.usedLevel ?? 0) : null}
        totalLevel={info?.totalLevel ?? null}
        seasonLevel={info?.seasonLevel ?? null}
        memberLevel={info?.memberLevel ?? null}
        stagedPoints={stagedLevels}
      />

      {failedAction ? (
        <p role="alert" className="card-container card-pad-sm border-danger/40 text-sm text-danger">
          {t(`error.${failedAction}`)}
        </p>
      ) : null}

      {PROPERTY_GROUPS.map((group) => {
        const defs = PROPERTY_LIST.filter((def) => def.group === group);
        const maxedCount = defs.filter((def) => levelOf(def.name) === PROPERTY_MAX_LEVEL).length;
        const maxedText = (count: number) =>
          t('group.maxedCount', { maxed: count, total: defs.length });
        return (
          <section key={group} className="space-y-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="title-secondary">{t(`group.${group}.title`)}</h2>
              <span className="text-sm text-muted">{t(`group.${group}.hint`)}</span>
              <span className="ml-auto text-sm text-muted tabular-nums">
                {info ? maxedText(maxedCount) : <Skeleton>{maxedText(0)}</Skeleton>}
              </span>
            </div>
            <div className="grid gap-2.5 lg:grid-cols-2">
              {defs.map((def) => (
                <PropertyCard
                  key={def.name}
                  def={def}
                  level={levelOf(def.name)}
                  pendingCells={pending[def.name] ?? 0}
                  usablePoints={usableLevel}
                  busy={busy !== null}
                  readOnly={!isSelf}
                  onPendingChange={(cells) =>
                    setPending((current) => ({ ...current, [def.name]: cells }))
                  }
                  onUpgrade={(targetLevel) => handleUpgrade(def, targetLevel)}
                />
              ))}
            </div>
          </section>
        );
      })}

      {info && isSelf ? (
        <ResetDialog
          open={dialogOpen}
          busy={busy === RESET_KEY}
          useableSeasonPoint={info.useableSeasonPoint ?? 0}
          useableMemberPoint={info.useableMemberPoint ?? 0}
          onClose={() => setDialogOpen(false)}
          onConfirm={handleReset}
        />
      ) : null}
    </div>
  );
}
