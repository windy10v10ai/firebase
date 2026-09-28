import { useTranslations } from 'next-intl';

import { LAUNCHER_FILE_NAME } from './launcher';

interface SmartScreenFigureProps {
  step: 1 | 2;
}

const MARK = 'rounded-[4px] outline-2 outline-offset-2 outline-warning';

/**
 * Windows 拦截未签名程序时的弹窗示意，两步各画一张。
 * 弹窗外观因系统版本而异，只画中性色简图，按钮位置照原样排，玩家是按位置找按钮的。
 * 整块对读屏隐藏：同样的步骤已经写在上方的标题里。
 */
export default function SmartScreenFigure({ step }: SmartScreenFigureProps) {
  const t = useTranslations('launch.smartScreen');

  return (
    <div
      aria-hidden="true"
      className="relative flex min-h-[170px] flex-col gap-2 rounded-[8px] border border-dashed border-line-strong bg-panel-soft px-4 py-3.5 md:min-h-[190px] md:gap-2.5"
    >
      <p className="text-sm text-heading md:text-[15px]">{t('title')}</p>
      <span className="h-2 w-[90%] rounded-full bg-line" />
      {step === 1 ? (
        <>
          <span className="h-2 w-[65%] rounded-full bg-line" />
          <span
            className={`mt-1 self-start px-1 text-[13px] text-heading underline md:text-sm ${MARK}`}
          >
            {t('moreInfo')}
          </span>
        </>
      ) : (
        <>
          <p className="text-xs text-muted md:text-[13px]">
            {t('app')} {LAUNCHER_FILE_NAME}
          </p>
          <p className="text-xs text-muted md:text-[13px]">{t('publisher')}</p>
        </>
      )}
      <div className="mt-auto flex flex-wrap justify-end gap-2 md:gap-3">
        {step === 2 ? (
          <span
            className={`px-2 py-1 text-xs font-bold whitespace-nowrap md:px-3 text-heading md:text-[13px] ${MARK}`}
          >
            {t('runAnyway')}
          </span>
        ) : null}
        <span className="rounded-[4px] bg-line px-2 py-1 text-xs whitespace-nowrap md:px-3 text-muted md:text-[13px]">
          {t('dontRun')}
        </span>
      </div>
      <span className="absolute -top-2.5 -left-2.5 flex size-6 items-center justify-center rounded-full bg-warning text-sm font-bold text-surface">
        {step}
      </span>
    </div>
  );
}
