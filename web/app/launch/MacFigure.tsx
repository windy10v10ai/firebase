import { Search, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { MARK, Step } from './SmartScreenFigure';

interface MacFigureProps {
  kind: 'install' | 'warning' | 'settings';
}

const FRAME = 'flex min-h-[200px] rounded-[8px] border border-dashed border-line-strong';

/**
 * macOS 安装与放行的示意图，点击按编号先后点。
 * 安装图照 DMG 窗口的实际配色画，不跟站内色板走，玩家打开 DMG 时看到的就是这个样子；其余两张只画中性色简图，按位置排，玩家是按位置找按钮的。
 * 整块对读屏隐藏：同样的步骤已经写在上方的标题里。
 */
export default function MacFigure({ kind }: MacFigureProps) {
  const t = useTranslations('launch.launcher');

  if (kind === 'install') {
    return (
      <div
        aria-hidden="true"
        className={`${FRAME} items-center justify-center gap-5 bg-linear-to-b from-[#211d1a] to-[#161412] px-4 py-3.5 md:gap-7`}
      >
        <div className="flex flex-col items-center gap-2">
          <span className={`${MARK} block p-0.5`}>
            <Step n={1} />
            {/* eslint-disable-next-line @next/next/no-img-element -- 固定尺寸的本地小图，不需要 next/image 的裁剪与响应式 */}
            <img
              src="/images/launcher.webp"
              alt=""
              width={72}
              height={72}
              className="block size-[72px]"
            />
          </span>
          <span className="text-xs text-[#aca198]">Windy10v10AI</span>
        </div>
        <svg width="60" height="30" viewBox="0 0 60 30" className="shrink-0 fill-[#e0552d]">
          <path d="M3 12h32v6H3z" />
          <path d="M34 3l23 12-23 12z" />
        </svg>
        <div className="flex flex-col items-center gap-2">
          <span className="relative block h-[60px] w-[72px]">
            <span className="absolute top-0 left-0 h-[11px] w-8 rounded-t-[5px] bg-[#4a94dc]" />
            <span className="absolute top-[7px] left-0 h-[53px] w-[72px] rounded-lg bg-linear-to-b from-[#8cc7f7] to-[#6bb2ee]" />
          </span>
          <span className="text-xs text-[#aca198]">{t('macInstall.applications')}</span>
        </div>
      </div>
    );
  }

  if (kind === 'warning') {
    return (
      <div
        aria-hidden="true"
        className={`${FRAME} items-center justify-center bg-panel-soft px-4 py-4`}
      >
        <div className="flex w-full max-w-[300px] flex-col items-center gap-2 rounded-xl border border-line-strong bg-panel px-3.5 py-3.5 text-center">
          <TriangleAlert className="size-[30px] text-warning" strokeWidth={1.8} />
          <p className="text-[13px] font-bold text-heading">{t('macWarning.title')}</p>
          <p className="text-[11px] leading-[1.5] text-muted">{t('macWarning.body')}</p>
          <div className="mt-1 flex w-full gap-2">
            <span className={`flex-1 rounded-md bg-line px-2 py-1.5 text-xs text-heading ${MARK}`}>
              <Step n={2} />
              {t('macWarning.done')}
            </span>
            <span className="flex-1 rounded-md border border-line bg-panel-soft px-2 py-1.5 text-xs text-faint">
              {t('macWarning.trash')}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      className="flex flex-col overflow-hidden rounded-[8px] border border-dashed border-line-strong bg-panel md:flex-row"
    >
      <div className="flex shrink-0 flex-col gap-2 border-b border-line bg-surface p-4 md:w-[34%] md:border-r md:border-b-0">
        <span
          className={`flex items-center gap-1.5 rounded-[7px] bg-panel-soft px-2 py-1.5 text-xs text-heading ${MARK}`}
        >
          <Step n={3} />
          <Search className="size-3.5 shrink-0 text-muted" strokeWidth={2} />
          {t('macSettings.search')}
        </span>
        <span className={`rounded-md bg-line px-2 py-1.5 text-xs text-heading ${MARK}`}>
          <Step n={4} />
          {t('macSettings.privacy')}
        </span>
        <span className="px-2 py-0.5 text-[11px] text-muted">{t('macSettings.securityItem')}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-3">
        <div className="flex flex-col gap-1.5 opacity-50">
          <span className="h-2.5 w-4/5 rounded-full bg-line" />
          <span className="h-2.5 w-3/5 rounded-full bg-line" />
        </div>
        <p className="px-0.5 text-xs font-bold text-heading">{t('macSettings.security')}</p>
        <div className="flex flex-col items-start gap-1.5 rounded-[7px] border border-line bg-panel-soft px-2.5 py-2 text-[11px] text-content md:flex-row md:items-center md:justify-between md:gap-2">
          <span>{t('macSettings.allow')}</span>
          <span className="text-muted md:text-right">{t('macSettings.source')}</span>
        </div>
        <div className="flex flex-col items-start gap-1.5 rounded-[7px] border border-line bg-panel-soft px-2.5 py-2 text-[11px] text-content md:flex-row md:items-center md:justify-between md:gap-2">
          <span>{t('macSettings.blocked')}</span>
          <span
            className={`shrink-0 rounded-md bg-line px-2.5 py-0.5 font-bold whitespace-nowrap text-heading ${MARK}`}
          >
            <Step n={5} />
            {t('macSettings.open')}
          </span>
        </div>
      </div>
    </div>
  );
}
