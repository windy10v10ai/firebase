'use client';

import { Download } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState, useSyncExternalStore } from 'react';

import GithubIcon from '../components/GithubIcon';

import {
  LAUNCHER_FILE_NAME,
  LAUNCHER_MAC_FILE_NAME,
  LAUNCHER_MAC_URL,
  LAUNCHER_MAC_VERSION,
  LAUNCHER_SOURCE_URL,
  LAUNCHER_URL,
  LAUNCHER_VERSION,
} from './launcher';
import MacFigure from './MacFigure';
import SmartScreenFigure from './SmartScreenFigure';

type Platform = 'windows' | 'mac';

const TABS: Platform[] = LAUNCHER_MAC_VERSION === null ? ['windows'] : ['windows', 'mac'];

type Device = Platform | 'touch';

// iPad 的 UA 与 Mac 相同，靠触点数区分
function detectDevice(): Device {
  const ua = navigator.userAgent;
  const mac = /Macintosh/.test(ua);
  if (/Android|iPhone|iPad|Mobi/.test(ua) || (mac && navigator.maxTouchPoints > 1)) return 'touch';
  return mac && LAUNCHER_MAC_VERSION !== null ? 'mac' : 'windows';
}

const subscribeNothing = () => () => {};

export default function LauncherDownload() {
  const t = useTranslations('launch.launcher');
  // 服务端渲染时不知道设备，首屏先按 Windows 画，挂载后再按设备切换
  const device = useSyncExternalStore(subscribeNothing, detectDevice, () => 'windows' as Device);
  const [chosen, setChosen] = useState<Platform | null>(null);
  const touch = device === 'touch';
  const platform = chosen ?? (device === 'mac' ? 'mac' : 'windows');

  const mark = (chunks: React.ReactNode) => (
    <span className="font-bold text-heading">{chunks}</span>
  );
  // 不换行：窄屏时图标和文字被拆到两行，读起来像两样东西
  const github = (chunks: React.ReactNode) => (
    <a
      href={LAUNCHER_SOURCE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="link-inline whitespace-nowrap"
    >
      <GithubIcon className="mr-1 inline-block size-4 align-[-0.125em]" />
      {chunks}
    </a>
  );

  const isMac = platform === 'mac';
  const headingClass = 'text-[15px] font-bold text-heading md:text-base';

  return (
    <div className="space-y-5">
      {TABS.length > 1 && (
        <div
          role="tablist"
          className="inline-flex gap-1 rounded-[10px] border border-line bg-panel-soft p-1"
        >
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={platform === tab}
              onClick={() => setChosen(tab)}
              className={`min-h-11 rounded-[7px] px-5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link lg:min-h-9 ${
                platform === tab
                  ? 'bg-panel text-heading ring-1 ring-link-border ring-inset'
                  : 'text-muted hover:text-heading'
              }`}
            >
              {tab === 'mac' ? 'Mac' : 'Windows'}
            </button>
          ))}
        </div>
      )}

      {touch && (
        <p className="text-[15px] leading-[22px] font-bold text-heading text-pretty md:text-base md:leading-6">
          {t('desktopOnly')}
        </p>
      )}

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-5">
        <div className="flex min-w-0 flex-1 items-center gap-3 md:gap-5">
          {/* eslint-disable-next-line @next/next/no-img-element -- 固定尺寸的本地小图，不需要 next/image 的裁剪与响应式 */}
          <img
            src="/images/launcher.webp"
            alt=""
            width={72}
            height={72}
            className="size-14 shrink-0 rounded-[8px] md:size-[72px]"
          />
          <div className="min-w-0">
            <h2 className="text-base font-bold text-heading md:text-[22px]">{t('name')}</h2>
            <p className="mt-1 text-[13px] leading-[19px] text-content text-pretty md:text-[15px] md:leading-[22px]">
              {t('lead')}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-2 md:items-center">
          <a
            href={isMac ? LAUNCHER_MAC_URL : LAUNCHER_URL}
            download={isMac ? LAUNCHER_MAC_FILE_NAME : LAUNCHER_FILE_NAME}
            className="btn-cta"
          >
            <Download className="size-[18px]" aria-hidden="true" />
            {t('download')}
          </a>
          <span className="text-center text-xs text-muted">
            {isMac ? LAUNCHER_MAC_FILE_NAME : LAUNCHER_FILE_NAME}
          </span>
          <span className="text-center text-xs text-muted">
            v{isMac ? LAUNCHER_MAC_VERSION : LAUNCHER_VERSION}
          </span>
          {isMac && <span className="text-center text-xs text-muted">{t('appleSilicon')}</span>}
        </div>
      </div>

      <p className="border-t border-line pt-5 text-[15px] leading-[22px] text-content text-pretty md:text-base md:leading-6">
        {isMac ? t('suspiciousMac') : t('suspicious')}
      </p>

      {isMac ? (
        <>
          <div className="space-y-3">
            <p className={headingClass}>{t.rich('macInstallPrompt', { mark })}</p>
            <div className="grid gap-3 md:grid-cols-2 md:gap-5">
              <MacFigure kind="install" />
              <MacFigure kind="warning" />
            </div>
          </div>
          <div className="space-y-3">
            <p className={headingClass}>{t.rich('macAllowPrompt', { mark })}</p>
            <MacFigure kind="settings" />
          </div>
        </>
      ) : (
        // 宽屏按列排，两条标题同在第一行，示意图顶边才对齐
        <div className="grid gap-x-5 gap-y-3 md:grid-flow-col md:grid-cols-2 md:grid-rows-[auto_auto]">
          <p className={headingClass}>{t.rich('browserPrompt', { mark })}</p>
          <SmartScreenFigure kind="browser" />
          <p className={`mt-3 md:mt-0 ${headingClass}`}>{t.rich('windowsPrompt', { mark })}</p>
          <SmartScreenFigure kind="windows" />
        </div>
      )}

      <p className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line pt-4 text-[13px] text-muted">
        <span>{t.rich('openSource', { github })}</span>
        <Link href="/launch/code-signing" className="link-hover underline">
          {t('codeSigning')}
        </Link>
      </p>
    </div>
  );
}
