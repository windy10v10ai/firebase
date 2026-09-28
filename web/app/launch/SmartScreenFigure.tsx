import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { LAUNCHER_FILE_NAME } from './launcher';

interface SmartScreenFigureProps {
  kind: 'browser' | 'windows';
}

const MARK = 'relative rounded-[4px] outline-2 outline-offset-2 outline-warning';

function Step({ n }: { n: 1 | 2 }) {
  return (
    <span className="absolute -top-3.5 -left-3.5 flex size-5 items-center justify-center rounded-full bg-warning text-xs font-bold text-surface">
      {n}
    </span>
  );
}

/**
 * 浏览器与 Windows 拦截时的弹窗示意，两次点击画在同一张图里，按编号先后点。
 * 弹窗外观因版本而异，只画中性色简图，按钮位置照原样排，玩家是按位置找按钮的。
 * 整块对读屏隐藏：同样的步骤已经写在上方的标题里。
 */
export default function SmartScreenFigure({ kind }: SmartScreenFigureProps) {
  const t = useTranslations(kind === 'browser' ? 'launch.browserBlock' : 'launch.smartScreen');

  return (
    <div
      aria-hidden="true"
      className="flex min-h-[170px] flex-col gap-2.5 rounded-[8px] border border-dashed border-line-strong bg-panel-soft px-4 py-3.5 md:min-h-[190px]"
    >
      {kind === 'browser' ? (
        <>
          <div className="flex items-center gap-2.5">
            <TriangleAlert className="size-[18px] shrink-0 text-muted" />
            <div className={`px-1.5 py-0.5 ${MARK}`}>
              <Step n={1} />
              <p className="text-sm text-heading md:text-[15px]">{LAUNCHER_FILE_NAME}</p>
              <p className="text-xs text-muted md:text-[13px]">{t('blocked')}</p>
            </div>
          </div>
          <span className="border-t border-line" />
          <p className="text-xs text-muted md:text-[13px]">{t('warning')}</p>
          <div className="mt-auto flex flex-wrap justify-end gap-2 md:gap-3">
            <span className="rounded-full bg-line px-3 py-1 text-xs whitespace-nowrap text-muted md:text-[13px]">
              {t('delete')}
            </span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold whitespace-nowrap text-heading md:text-[13px] ${MARK}`}
            >
              <Step n={2} />
              {t('keep')}
            </span>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-heading md:text-[15px]">{t('title')}</p>
          <span className="h-2 w-[90%] rounded-full bg-line" />
          <span className={`self-start px-1 text-[13px] text-heading underline md:text-sm ${MARK}`}>
            <Step n={1} />
            {t('moreInfo')}
          </span>
          <p className="text-xs text-muted md:text-[13px]">
            {t('app')} {LAUNCHER_FILE_NAME}
            <br />
            {t('publisher')}
          </p>
          <div className="mt-auto flex flex-wrap justify-end gap-2 md:gap-3">
            <span
              className={`px-2 py-1 text-xs font-bold whitespace-nowrap text-heading md:px-3 md:text-[13px] ${MARK}`}
            >
              <Step n={2} />
              {t('runAnyway')}
            </span>
            <span className="rounded-[4px] bg-line px-2 py-1 text-xs whitespace-nowrap text-muted md:px-3 md:text-[13px]">
              {t('dontRun')}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
