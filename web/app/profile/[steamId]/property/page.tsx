'use client';

import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import LoginPanel from '@/app/components/LoginPanel';
import Notice from '@/app/components/Notice';
import OfflineNotice from '@/app/components/OfflineNotice';
import { ApiError } from '@/app/lib/api';
import {
  fetchPlayerProperties,
  resetProperties,
  upgradeProperty,
  type PlayerInfo,
} from '@/app/lib/player-info';
import { PROPERTY_GROUPS, PROPERTY_LIST, type PropertyDef } from '@/config/properties';

import PointsCard from './PointsCard';
import PropertyCard from './PropertyCard';
import ResetDialog from './ResetDialog';

// 带上请求时用的 steamId，换一个玩家时旧结果立刻失效
type LoadResult =
  | { steamId: string; status: 'failed'; httpStatus: number }
  | { steamId: string; status: 'ready'; info: PlayerInfo };

const FAILURE_KEY: Record<number, string> = {
  403: 'private',
  404: 'noRecord',
};

const RESET_KEY = 'reset';

export default function PropertyPage() {
  const t = useTranslations('property');
  const { steamId } = useParams<{ steamId: string }>();

  const [result, setResult] = useState<LoadResult | null>(null);
  // 属性名 → 还没提交的档数
  const [pending, setPending] = useState<Record<string, number>>({});
  // 正在提交的属性名，或 RESET_KEY；同一时刻只允许一个请求在飞
  const [busy, setBusy] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [failedAction, setFailedAction] = useState<string | null>(null);

  const loaded = result?.steamId === steamId ? result : null;

  useEffect(() => {
    let cancelled = false;

    fetchPlayerProperties(steamId)
      .then((info) => {
        if (!cancelled) {
          setResult({ steamId, status: 'ready', info });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setResult({
            steamId,
            status: 'failed',
            httpStatus: error instanceof ApiError ? error.status : 0,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [steamId]);

  /** 请求失败后重新拉一次，免得界面停在已经不成立的数值上 */
  const resync = useCallback(async () => {
    try {
      const info = await fetchPlayerProperties(steamId);
      setResult({ steamId, status: 'ready', info });
    } catch {
      // 连重新拉取都失败时保留原来的画面，错误提示已经给过了
    }
    setPending({});
  }, [steamId]);

  const handleUpgrade = useCallback(
    async (def: PropertyDef, targetLevel: number) => {
      setBusy(def.name);
      setFailedAction(null);
      try {
        const info = await upgradeProperty(steamId, def.name, targetLevel);
        setResult({ steamId, status: 'ready', info });
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
    [resync, steamId],
  );

  const handleReset = useCallback(
    async (useMemberPoint: boolean) => {
      setBusy(RESET_KEY);
      setFailedAction(null);
      try {
        const info = await resetProperties(steamId, useMemberPoint);
        setResult({ steamId, status: 'ready', info });
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
    [resync, steamId],
  );

  if (loaded?.status === 'failed') {
    // 页面不判断登录，看得到看不到由接口说了算
    if (loaded.httpStatus === 401) {
      return <LoginPanel />;
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
        <h1 className="title-primary">{t('title')}</h1>
        <p className="text-sm text-muted">{t('intro')}</p>
      </div>

      <OfflineNotice subject="property" />

      <PointsCard
        steamId={steamId}
        usableLevel={usableLevel}
        totalLevel={info?.totalLevel ?? null}
        seasonLevel={info?.seasonLevel ?? null}
        memberLevel={info?.memberLevel ?? null}
        onReset={() => {
          if (info) {
            setDialogOpen(true);
          }
        }}
      />

      {failedAction ? (
        <p role="alert" className="card-container card-pad-sm border-danger/40 text-sm text-danger">
          {t(`error.${failedAction}`)}
        </p>
      ) : null}

      {PROPERTY_GROUPS.map((group) => {
        const defs = PROPERTY_LIST.filter((def) => def.group === group);
        return (
          <section key={group} className="space-y-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="title-secondary">{t(`group.${group}.title`)}</h2>
              <span className="text-sm text-muted">
                {t(`group.${group}.hint`, { count: defs.length })}
              </span>
            </div>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {defs.map((def) => {
                const pendingCells = pending[def.name] ?? 0;
                return (
                  <PropertyCard
                    key={def.name}
                    def={def}
                    level={levelOf(def.name)}
                    pendingCells={pendingCells}
                    canAdd={usableLevel !== null && usableLevel >= def.levelPerStep}
                    busy={busy !== null}
                    onPendingChange={(cells) =>
                      setPending((current) => ({ ...current, [def.name]: cells }))
                    }
                    onUpgrade={(targetLevel) => handleUpgrade(def, targetLevel)}
                  />
                );
              })}
            </div>
          </section>
        );
      })}

      {info ? (
        <ResetDialog
          open={dialogOpen}
          busy={busy === RESET_KEY}
          useableSeasonPoint={info.useableSeasonPoint}
          useableMemberPoint={info.useableMemberPoint}
          onClose={() => setDialogOpen(false)}
          onConfirm={handleReset}
        />
      ) : null}
    </div>
  );
}
