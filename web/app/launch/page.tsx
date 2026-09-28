import { Check, Download, Triangle, X } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import GithubIcon from '../components/GithubIcon';
import Section from '../components/Section';
import { pageTitle } from '../lib/page-title';

import {
  LAUNCHER_FILE_NAME,
  LAUNCHER_SOURCE_URL,
  LAUNCHER_URL,
  LAUNCHER_VERSION,
} from './launcher';
import SmartScreenFigure from './SmartScreenFigure';

export const generateMetadata = pageTitle('launch', 'title');

interface Cell {
  mark: 'yes' | 'partial' | 'no';
  noteKey?: string;
}

const COMPARE_ROWS: { labelKey: string; arcade: Cell; launcher: Cell }[] = [
  { labelKey: 'multiplayer', arcade: { mark: 'yes' }, launcher: { mark: 'no' } },
  { labelKey: 'records', arcade: { mark: 'yes' }, launcher: { mark: 'yes' } },
  {
    labelKey: 'stable',
    arcade: { mark: 'partial', noteKey: 'stableArcade' },
    launcher: { mark: 'yes' },
  },
  { labelKey: 'smooth', arcade: { mark: 'partial' }, launcher: { mark: 'yes' } },
];

// 两列各适合一种玩法，不分主次，所以徽章同色
const HINT_CLASS =
  'mt-1 inline-block rounded-full border border-success/40 bg-success/10 px-1.5 text-[10px] leading-4 font-medium text-success md:px-2 md:text-xs md:leading-5';

export default function LaunchPage() {
  const t = useTranslations('launch');

  const mark = (chunks: React.ReactNode) => <span className="text-warning">{chunks}</span>;
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

  // 能不能用一眼看完，所以正文只留符号；窄屏再加字会把列挤到折行
  const renderCell = (cell: Cell) => (
    <span className="inline-flex items-center gap-2 text-left">
      {cell.mark === 'yes' ? (
        <Check
          className="size-[18px] shrink-0 text-success md:size-5"
          strokeWidth={2.5}
          aria-label={t('compare.yes')}
        />
      ) : cell.mark === 'no' ? (
        <X
          className="size-[18px] shrink-0 text-danger md:size-5"
          strokeWidth={2.5}
          aria-label={t('compare.no')}
        />
      ) : (
        // 有时不行不算大问题，用正文色而不是警示色，免得玩家以为这条路不能走
        <Triangle
          className="size-4 shrink-0 text-content md:size-[18px]"
          strokeWidth={2.5}
          aria-label={t('compare.partial')}
        />
      )}
      {cell.noteKey ? (
        <span className="hidden text-sm text-muted md:inline">{t(`compare.${cell.noteKey}`)}</span>
      ) : null}
    </span>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <h1 className="title-primary">{t('title')}</h1>

      <Section title={t('compare.title')}>
        <div className="w-full overflow-hidden rounded-[10px] border border-line bg-panel">
          <table className="w-full table-fixed">
            <thead>
              <tr className="border-b border-line bg-panel-raised">
                <th className="px-2 py-3 md:p-4" />
                <th scope="col" className="w-[76px] px-1.5 py-3 text-center md:w-[26%] md:p-4">
                  <span className="block text-sm font-bold text-heading md:text-lg">
                    {t('compare.arcade')}
                  </span>
                  <span className={HINT_CLASS}>{t('compare.arcadeHint')}</span>
                </th>
                <th scope="col" className="w-[76px] px-1.5 py-3 text-center md:w-[26%] md:p-4">
                  <span className="block text-sm font-bold text-heading md:text-lg">
                    {t('compare.launcher')}
                  </span>
                  <span className={HINT_CLASS}>{t('compare.launcherHint')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARE_ROWS.map((row, index) => (
                <tr
                  key={row.labelKey}
                  className={`border-b border-line last:border-b-0 ${
                    index % 2 === 0 ? 'bg-panel' : 'bg-panel-soft'
                  }`}
                >
                  <th
                    scope="row"
                    className="px-2 py-3 text-left align-middle text-[13px] leading-[19px] font-medium text-heading md:p-4 md:text-base md:leading-6"
                  >
                    {t(`compare.${row.labelKey}`)}
                  </th>
                  <td className="px-1.5 py-3 text-center md:p-4">{renderCell(row.arcade)}</td>
                  <td className="px-1.5 py-3 text-center md:p-4">{renderCell(row.launcher)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[13px] leading-[19px] text-muted md:text-sm md:leading-5">
          {t('compare.noteOffline')}
        </p>
      </Section>

      <Section>
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
              <h2 className="text-base font-bold text-heading md:text-[22px]">
                {t('launcher.name')}
              </h2>
              <p className="mt-1 text-[13px] leading-[19px] text-content text-pretty md:text-[15px] md:leading-[22px]">
                {t('launcher.lead')}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-stretch gap-2 md:items-center">
            <a href={LAUNCHER_URL} download={LAUNCHER_FILE_NAME} className="btn-primary">
              <Download className="size-[18px]" aria-hidden="true" />
              {t('launcher.download')}
            </a>
            <span className="text-center text-xs text-muted">
              {LAUNCHER_FILE_NAME} · v{LAUNCHER_VERSION}
            </span>
          </div>
        </div>

        <div className="mt-5 border-t border-line pt-5">
          <p className="text-[15px] leading-[22px] text-content text-pretty md:text-base md:leading-6">
            {t('launcher.suspicious')}
            <br />
            {t.rich('launcher.openSource', { github })}
          </p>
          {/* 宽屏按列排，两条标题同在第一行，示意图顶边才对齐 */}
          <div className="mt-5 grid gap-x-5 gap-y-3 md:grid-flow-col md:grid-cols-2 md:grid-rows-[auto_auto]">
            <p className="text-[15px] font-bold text-heading md:text-base">
              {t.rich('launcher.browserPrompt', { mark })}
            </p>
            <SmartScreenFigure kind="browser" />
            <p className="mt-3 text-[15px] font-bold text-heading md:mt-0 md:text-base">
              {t.rich('launcher.windowsPrompt', { mark })}
            </p>
            <SmartScreenFigure kind="windows" />
          </div>
          {/* SignPath 要求下载页写明签名来源 */}
          <p className="mt-5 text-xs text-muted text-pretty">
            {t('launcher.signing')}{' '}
            <Link href="/launch/code-signing" className="link-hover underline">
              {t('launcher.codeSigning')}
            </Link>
          </p>
        </div>
      </Section>

      <Section title={t('website.title')}>
        <p className="text-content text-pretty">{t('website.body')}</p>
        <p className="mt-2 text-content text-pretty">{t('website.checkIn')}</p>
      </Section>
    </div>
  );
}
