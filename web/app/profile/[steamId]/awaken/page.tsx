'use client';

import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';

import LoginPanel from '@/app/components/LoginPanel';
import Notice from '@/app/components/Notice';
import PageSkeleton from '@/app/components/PageSkeleton';
import { ApiError } from '@/app/lib/api';
import { useAuth } from '@/app/lib/auth';
import {
  AWAKEN_MEMBER_POINT_COST,
  AWAKEN_RANDOM_CANDIDATE_COUNT,
  AWAKEN_RANDOM_MEMBER_POINT_COST,
  AWAKEN_RANDOM_SEASON_POINT_COST,
  AWAKEN_SEASON_POINT_COST,
  awakenHero,
  ensureRandomCandidates,
  fetchPlayerAwakening,
  pickRandomCandidates,
} from '@/app/lib/awaken';
import { AWAKEN_HEROES, type AwakenHero } from '@/config/awaken';

import AwakenCard from './AwakenCard';
import AwakenDialog from './AwakenDialog';
import CandidatesDialog from './CandidatesDialog';
import RandomCard from './RandomCard';

import type { PlayerInfo } from '@/app/lib/player-info';

// 带上请求时用的 steamId，换一个玩家时旧结果立刻失效
type LoadResult =
  | { steamId: string; status: 'failed'; httpStatus: number }
  | { steamId: string; status: 'ready'; info: PlayerInfo };

const FAILURE_KEY: Record<number, string> = {
  403: 'private',
  404: 'noRecord',
};

const HERO_BY_NAME = new Map(AWAKEN_HEROES.map((hero) => [hero.heroName, hero]));
const ALL_HERO_NAMES = AWAKEN_HEROES.map((hero) => hero.heroName);
// 随机卡上扇形叠放的三张，取最新上线的 3 个觉醒
const RANDOM_PREVIEW = AWAKEN_HEROES.slice(0, 3);

export default function AwakenPage() {
  const t = useTranslations('awaken');
  const { steamId } = useParams<{ steamId: string }>();
  const auth = useAuth();

  const [result, setResult] = useState<LoadResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  // 打开详情的英雄，以及它是不是从随机候选点进来的（决定半价文案）
  const [target, setTarget] = useState<{ hero: AwakenHero; fromRandom: boolean } | null>(null);
  const [candidatesOpen, setCandidatesOpen] = useState(false);
  const [candidates, setCandidates] = useState<AwakenHero[]>([]);

  // TODO(批次 10 #1176)：PageSkeleton 会被删掉，加载态改成结构直出 + 骨架块。
  // 那一批合进 develop 后，这里连同「等登录态再发请求」的判断一起改。
  const authResolved = auth.status !== 'loading';
  const loaded = result?.steamId === steamId ? result : null;

  useEffect(() => {
    if (!authResolved) {
      return;
    }
    let cancelled = false;
    fetchPlayerAwakening(steamId)
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
  }, [authResolved, steamId]);

  /** 请求失败后重新拉一次，免得界面停在已经不成立的数值上 */
  const resync = useCallback(async () => {
    try {
      const info = await fetchPlayerAwakening(steamId);
      setResult({ steamId, status: 'ready', info });
    } catch {
      // 连重新拉取都失败时保留原画面，错误提示已经给过了
    }
  }, [steamId]);

  const awakenedNames = useMemo(
    () => (loaded?.status === 'ready' ? loaded.info.awakenedHeroes ?? [] : []).map((a) => a.heroName),
    [loaded],
  );

  const handleRandom = useCallback(async () => {
    const picked = pickRandomCandidates(ALL_HERO_NAMES, awakenedNames);
    if (picked.length < AWAKEN_RANDOM_CANDIDATE_COUNT) {
      return;
    }
    setFailed(null);
    setCandidates([]);
    setCandidatesOpen(true);
    try {
      const response = await ensureRandomCandidates(steamId, picked);
      // 必须用接口返回的候选：账号里已有未认领的候选时接口忽略上传值、原样返回旧的那份
      setCandidates(response.candidates.map((name) => HERO_BY_NAME.get(name)).filter((h) => !!h));
    } catch {
      setCandidatesOpen(false);
      setFailed('random');
    }
  }, [awakenedNames, steamId]);

  const handleConfirm = useCallback(
    async (useMemberPoint: boolean) => {
      if (!target) {
        return;
      }
      setBusy(true);
      setFailed(null);
      try {
        const info = await awakenHero(steamId, target.hero.heroName, useMemberPoint);
        setResult({ steamId, status: 'ready', info });
        setTarget(null);
        setCandidatesOpen(false);
        setCandidates([]);
      } catch {
        setFailed('unlock');
        setTarget(null);
        await resync();
      } finally {
        setBusy(false);
      }
    },
    [resync, steamId, target],
  );

  if (!loaded) {
    return <PageSkeleton label={t('loading')} />;
  }

  if (loaded.status === 'failed') {
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

  const { info } = loaded;
  const awakenedSet = new Set(awakenedNames);
  const remaining = AWAKEN_HEROES.length - awakenedSet.size;
  const canAffordDirect =
    info.useableSeasonPoint >= AWAKEN_SEASON_POINT_COST ||
    info.useableMemberPoint >= AWAKEN_MEMBER_POINT_COST;
  const canAffordRandom =
    info.useableSeasonPoint >= AWAKEN_RANDOM_SEASON_POINT_COST ||
    info.useableMemberPoint >= AWAKEN_RANDOM_MEMBER_POINT_COST;
  const poolShort = remaining < AWAKEN_RANDOM_CANDIDATE_COUNT;

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="title-primary">{t('title')}</h1>
        <p className="text-sm text-muted">{t('intro')}</p>
      </div>

      <section className="card-container card-pad">
        <h2 className="title-secondary mb-3 text-lg">{t('rules.title')}</h2>
        <div className="flex flex-col gap-1.5 leading-relaxed">
          <p>
            <span className="font-bold text-heading">{t('rules.directLabel')}</span>
            {t('rules.colon')}
            {t.rich('rules.direct', {
              season: (chunks) => <span className="text-season">{chunks}</span>,
              member: (chunks) => <span className="text-member-strong">{chunks}</span>,
              b: (chunks) => <b className="text-heading">{chunks}</b>,
            })}
          </p>
          <p>
            <span className="font-bold text-heading">{t('rules.randomLabel')}</span>
            {t('rules.colon')}
            {t.rich('rules.random', {
              season: (chunks) => <span className="text-season">{chunks}</span>,
              member: (chunks) => <span className="text-member-strong">{chunks}</span>,
              b: (chunks) => <b className="text-heading">{chunks}</b>,
            })}
          </p>
          <p className="mt-1.5 border-t border-line pt-2.5 text-sm text-muted">{t('rules.note')}</p>
        </div>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="box-pad flex flex-1 items-baseline justify-between gap-3 rounded-lg border border-line bg-control">
          <span className="text-base text-muted">{t('stats.awakened')}</span>
          <span className="flex items-baseline gap-1">
            <span className="text-3xl leading-none font-bold text-heading">{awakenedSet.size}</span>
            <span className="leading-none font-bold text-muted">/ {AWAKEN_HEROES.length}</span>
          </span>
        </div>
        <div className="box-pad flex flex-1 items-baseline justify-between gap-3 rounded-lg border border-line bg-control">
          <span className="text-base text-muted">{t('stats.battlePoint')}</span>
          <span className="text-3xl leading-none font-bold text-season">
            {info.useableSeasonPoint.toLocaleString()}
          </span>
        </div>
        <div className="box-pad flex flex-1 items-baseline justify-between gap-3 rounded-lg border border-line bg-control">
          <span className="text-base text-muted">{t('stats.memberPoint')}</span>
          <span className="text-3xl leading-none font-bold text-member-strong">
            {info.useableMemberPoint.toLocaleString()}
          </span>
        </div>
      </div>

      {failed ? (
        <p role="alert" className="card-container border-danger/40 p-4 text-sm text-danger">
          {t(`error.${failed}`)}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
        <RandomCard
          preview={RANDOM_PREVIEW}
          enabled={!busy && canAffordRandom && !poolShort}
          poolShort={poolShort}
          onClick={handleRandom}
        />
        {AWAKEN_HEROES.map((hero) => (
          <AwakenCard
            key={hero.heroName}
            hero={hero}
            unlocked={awakenedSet.has(hero.heroName)}
            tooPoor={!canAffordDirect}
            busy={busy}
            onOpen={(picked) => setTarget({ hero: picked, fromRandom: false })}
          />
        ))}
      </div>

      <CandidatesDialog
        open={candidatesOpen}
        candidates={candidates}
        rollPool={AWAKEN_HEROES}
        onSelect={(hero) => setTarget({ hero, fromRandom: true })}
        onClose={() => setCandidatesOpen(false)}
      />

      <AwakenDialog
        hero={target?.hero ?? null}
        unlocked={target ? awakenedSet.has(target.hero.heroName) : false}
        fromRandom={target?.fromRandom ?? false}
        busy={busy}
        useableSeasonPoint={info.useableSeasonPoint}
        useableMemberPoint={info.useableMemberPoint}
        onClose={() => setTarget(null)}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
