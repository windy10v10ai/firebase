import { useTranslations } from 'next-intl';

import { MARK, Step } from './SmartScreenFigure';

interface MacFigureProps {
  kind: 'install' | 'blocked';
}

const FRAME =
  'flex min-h-[170px] rounded-[8px] border border-dashed border-line-strong md:min-h-[190px]';

/**
 * macOS 安装与放行的示意图，两处点击按编号先后点。
 * 安装图照 DMG 窗口的实际配色画，不跟站内色板走，玩家打开 DMG 时看到的就是这个样子；放行图只画中性色简图。
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
        <svg
          width="60"
          height="30"
          viewBox="0 0 60 30"
          className="shrink-0 fill-[#e0552d] stroke-[#e0552d]"
          strokeWidth="3"
          strokeLinecap="round"
        >
          <path d="M3 15h32" fill="none" />
          <path d="M34 3l23 12-23 12z" stroke="none" />
        </svg>
        <div className="flex flex-col items-center gap-2">
          <span className={`${MARK} block p-0.5`}>
            <Step n={2} />
            <span className="relative block h-[60px] w-[72px]">
              <span className="absolute top-0 left-0 h-[11px] w-8 rounded-t-[5px] bg-[#4a94dc]" />
              <span className="absolute top-[7px] left-0 h-[53px] w-[72px] rounded-lg bg-linear-to-b from-[#8cc7f7] to-[#6bb2ee]" />
            </span>
          </span>
          <span className="text-xs text-[#aca198]">{t('macInstall.applications')}</span>
        </div>
      </div>
    );
  }

  return (
    <div aria-hidden="true" className={`${FRAME} flex-col gap-2.5 bg-panel-soft px-4 py-3.5`}>
      <p className="text-xs text-muted md:text-[13px]">{t('macBlock.settings')}</p>
      <span className={`self-start px-2 py-0.5 text-sm text-heading ${MARK}`}>
        <Step n={1} />
        {t('macBlock.privacy')}
      </span>
      <p className="text-xs text-content text-pretty md:text-[13px]">{t('macBlock.blocked')}</p>
      <div className="mt-auto flex justify-end">
        <span
          className={`rounded-md bg-line px-3.5 py-1 text-xs font-bold whitespace-nowrap text-heading md:text-[13px] ${MARK}`}
        >
          <Step n={2} />
          {t('macBlock.open')}
        </span>
      </div>
    </div>
  );
}
