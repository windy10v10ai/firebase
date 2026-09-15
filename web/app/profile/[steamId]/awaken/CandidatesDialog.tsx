'use client';

/* eslint-disable @next/next/no-img-element -- 觉醒的立绘与图标是本地静态文件、尺寸已经是目标尺寸，过一道 next/image 优化器只是白付 CPU；理由见 docs/design/web/phase-3b-awaken-page.md */

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { awakenAssetPath } from '@/app/lib/awaken';

import type { AwakenHero } from '@/config/awaken';

// 每次轮播的间隔（毫秒），递增实现减速，尾部放慢制造「临停」感；总时长约 3.6s
const ROLL_DELAYS = [50, 60, 70, 80, 100, 130, 160, 200, 250, 320, 400, 500, 600, 700];
// 跑完后候选仍未到，按尾部同档的慢速继续闪，避免慢下来又突然变快
const ROLL_SLOW_DELAY = 600;
// 候选始终不到的兜底：超时关闭，不无限滚动
const ROLL_MAX_WAIT = 8000;
const SLOTS = 3;

function pick(pool: AwakenHero[], count: number) {
  const rest = pool.slice();
  const out: AwakenHero[] = [];
  for (let i = 0; i < count && rest.length > 0; i++) {
    out.push(...rest.splice(Math.floor(Math.random() * rest.length), 1));
  }
  return out;
}

interface RollProps {
  candidates: AwakenHero[];
  rollPool: AwakenHero[];
  onSelect: (hero: AwakenHero) => void;
  onClose: () => void;
}

/**
 * 轮播与定格。只在打开时挂载，关闭即卸载——滚动状态随之重置，
 * 不用在 effect 里手动清，也就不会有「打开时闪一下上次的结果」。
 */
function CandidatesRoll({ candidates, rollPool, onSelect, onClose }: RollProps) {
  const t = useTranslations('awaken.random');
  const locale = useLocale() === 'zh' ? 'zh' : 'en';
  const [rolling, setRolling] = useState<AwakenHero[]>(() => pick(rollPool, SLOTS));
  const [settled, setSettled] = useState(false);

  // 轮播的 tick 要读到最新的候选与关闭回调，但不该因为它们变化而重启滚动
  const latest = useRef({ candidates, onClose });
  useEffect(() => {
    latest.current = { candidates, onClose };
  });

  useEffect(() => {
    let cancelled = false;
    let tick = 0;
    let elapsed = 0;
    let timer: ReturnType<typeof setTimeout>;

    const step = () => {
      if (cancelled) {
        return;
      }
      const ready = latest.current.candidates.length >= SLOTS;
      const rollDone = tick >= ROLL_DELAYS.length;
      if (rollDone && ready) {
        setSettled(true);
        return;
      }
      if (elapsed >= ROLL_MAX_WAIT) {
        latest.current.onClose();
        return;
      }
      setRolling(pick(rollPool, SLOTS));
      const delay = rollDone ? ROLL_SLOW_DELAY : ROLL_DELAYS[tick];
      tick++;
      elapsed += delay;
      timer = setTimeout(step, delay);
    };
    timer = setTimeout(step, ROLL_DELAYS[0]);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // 挂载时启动一次；rollPool 是稳定常量，放进依赖会反复重启滚动
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shown = settled ? candidates : rolling;

  return (
    <div className="card-pad flex flex-col gap-3.5">
      <div className="text-center">
        <h2 className="text-[17px] font-bold text-member-strong">{t('candidatesTitle')}</h2>
        <p className="mt-1 text-sm leading-relaxed text-content">{t('candidatesDesc')}</p>
      </div>
      <div className="flex justify-center gap-3">
        {shown.map((hero, index) => (
          <div
            key={settled ? hero.heroName : `roll-${index}`}
            className="relative aspect-[145/190] w-[8.5rem] overflow-hidden rounded-[10px] border border-member-border"
          >
            <img
              src={awakenAssetPath(hero.art)}
              alt=""
              width={290}
              height={380}
              className={`absolute inset-0 size-full object-cover ${
                settled ? '' : 'blur-[1px] brightness-80'
              }`}
            />
            {settled ? (
              <>
                <div className="absolute inset-x-0 top-0 h-10 bg-linear-to-b from-surface/80 to-transparent" />
                <div className="absolute inset-x-1.5 top-1.5 truncate text-center text-[13px] font-bold text-heading [text-shadow:0_2px_4px_rgba(0,0,0,0.95)]">
                  {hero.name[locale]}
                </div>
                <div className="absolute inset-x-0 bottom-0 h-26 bg-linear-to-b from-transparent via-surface/95 to-surface/98" />
                <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-1.5 px-2.5 pb-2.5">
                  {hero.icon ? (
                    <img
                      src={awakenAssetPath(hero.icon)}
                      alt=""
                      width={96}
                      height={96}
                      className="size-11.5 rounded-[5px] border border-heading/20"
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onSelect(hero)}
                    className="flex h-7.5 w-full items-center justify-center rounded-[7px] border border-[#7a6fd0] bg-linear-to-r from-[#4f48b2] to-[#0f033a] text-[13px] font-bold text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.53)]"
                  >
                    {t('select')}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="min-h-11 rounded-[7px] border border-line bg-control text-sm text-content transition-colors hover:bg-control-hover"
      >
        {t('close')}
      </button>
    </div>
  );
}

interface CandidatesDialogProps {
  open: boolean;
  /** 接口返回的候选；没到齐时继续滚动 */
  candidates: AwakenHero[];
  /** 滚动时闪过的英雄池 */
  rollPool: AwakenHero[];
  onSelect: (hero: AwakenHero) => void;
  onClose: () => void;
}

/**
 * 随机候选层：点开即老虎机式轮播，减速后定格到接口返回的候选——照搬游戏。
 * 滚动不是装饰，它顺带盖住了抽选请求的网络延迟。
 */
export default function CandidatesDialog({ open, ...rest }: CandidatesDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

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

  return (
    <dialog
      ref={ref}
      onCancel={rest.onClose}
      onClick={(event) => {
        // 点遮罩关闭：事件落在 dialog 本身而不是里面的内容时才算点在遮罩上
        if (event.target === ref.current) {
          rest.onClose();
        }
      }}
      className="card-container m-auto w-[min(34rem,calc(100vw-2rem))] border-member-border p-0 text-content backdrop:bg-black/60"
    >
      {open ? <CandidatesRoll {...rest} /> : null}
    </dialog>
  );
}
