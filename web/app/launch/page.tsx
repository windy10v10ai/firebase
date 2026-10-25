import { Check, ChevronRight, Triangle, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import CopyIdButton from '../components/CopyIdButton';
import Section from '../components/Section';
import { pageTitle } from '../lib/page-title';

import { changelogKey, LAUNCHER_CHANGELOG } from './changelog';
import LauncherDownload from './LauncherDownload';

export const generateMetadata = pageTitle('launch', 'title');

interface Cell {
  mark: 'yes' | 'partial' | 'no';
}

const COMPARE_ROWS: { labelKey: string; arcade: Cell; launcher: Cell }[] = [
  { labelKey: 'multiplayer', arcade: { mark: 'yes' }, launcher: { mark: 'yes' } },
  { labelKey: 'records', arcade: { mark: 'yes' }, launcher: { mark: 'yes' } },
  { labelKey: 'stable', arcade: { mark: 'partial' }, launcher: { mark: 'yes' } },
  { labelKey: 'smooth', arcade: { mark: 'partial' }, launcher: { mark: 'yes' } },
];

const HINT_CLASS =
  'mt-1 inline-block rounded-full border border-success/40 bg-success/10 px-1.5 text-[10px] leading-4 font-medium text-success md:px-2 md:text-xs md:leading-5';

const CUSTOM_GAME_ID = '2307479570';

// 三张地图对应三个难度档，地图名让玩家自己填等于多一步出错机会
const CONSOLE_MODES = [
  { key: 'dota', name: 'Dota', map: 'dota' },
  { key: 'hard', name: 'Hard', map: 'hard' },
  { key: 'custom', name: 'Custom', map: 'custom' },
];

const consoleCommand = (map: string) => `dota_launch_custom_game ${CUSTOM_GAME_ID} ${map}`;

export default function LaunchPage() {
  const t = useTranslations('launch');

  const key = (chunks: React.ReactNode) => (
    <code className="rounded border border-line bg-panel-soft px-1.5 py-0.5 font-mono text-[13px] text-danger">
      {chunks}
    </code>
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
        <LauncherDownload />
      </Section>

      <details className="group card-container">
        <summary className="card-pad-sm flex list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
          <ChevronRight
            className="size-4 shrink-0 text-muted transition-transform group-open:rotate-90"
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 text-[15px] font-bold text-heading md:text-base">
            {t('console.summary')}
          </span>
          <span className="shrink-0 rounded-full border border-line-strong px-2 text-[11px] leading-[18px] text-content">
            {t('console.badge')}
          </span>
        </summary>
        <div className="card-pad-sm space-y-3 pt-1 md:space-y-3.5 md:pl-[44px]">
          <p className="text-[15px] leading-[22px] text-content text-pretty md:text-base md:leading-6">
            {t('console.intro')}
          </p>
          <ol className="list-decimal pl-5 text-[15px] leading-6 text-content marker:text-muted md:text-base md:leading-7">
            <li className="pl-1">{t('console.step1')}</li>
            <li className="pl-1">{t.rich('console.step2', { key })}</li>
            <li className="pl-1">{t('console.step3')}</li>
          </ol>
          <div className="space-y-2">
            {CONSOLE_MODES.map((mode) => (
              <div
                key={mode.key}
                className="flex flex-col gap-1 md:flex-row md:items-center md:gap-3"
              >
                <span className="flex items-baseline gap-2 md:w-[150px] md:shrink-0">
                  <span className="text-sm font-semibold text-heading">
                    {t(`console.difficulty.${mode.key}`)}
                  </span>
                  <span className="text-xs text-muted">{mode.name}</span>
                </span>
                {/* 命令用深色底加红字，与左侧难度名区分开 */}
                <div className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md border border-line bg-black/30 py-1.5 pr-1.5 pl-3 md:py-2 md:pr-2 md:pl-3.5">
                  <code className="min-w-0 font-mono text-xs break-words text-danger md:text-[13px]">
                    {consoleCommand(mode.map)}
                  </code>
                  <CopyIdButton
                    value={consoleCommand(mode.map)}
                    tooltip={t('console.copy')}
                    copiedLabel={t('console.copied')}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </details>

      {/* 启动器右上角的版本号链接到这个锚点 */}
      <Section id="changelog" title={t('changelog.title')}>
        {LAUNCHER_CHANGELOG.map(({ version, date }, index) => (
          <article
            key={version}
            className="flex flex-col gap-2 border-t border-line py-5 first:border-t-0 first:pt-0 last:pb-0"
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h3 className="text-base font-bold text-heading tabular-nums md:text-lg">
                v{version}
              </h3>
              <span className="text-sm text-muted tabular-nums">{date}</span>
              {index === 0 && (
                <span className="rounded-full border border-link-border bg-link/10 px-2.5 text-xs leading-5 font-medium text-link">
                  {t('changelog.latest')}
                </span>
              )}
            </div>
            <ul className="list-disc pl-5 text-[15px] leading-[26px] text-content text-pretty">
              {(t.raw(`changelog.entries.${changelogKey(version)}`) as string[]).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        ))}
      </Section>
    </div>
  );
}
