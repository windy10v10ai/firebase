import { Check, Clock, Play } from 'lucide-react';
import { useTranslations } from 'next-intl';

import CopyIdButton from '../components/CopyIdButton';
import Section from '../components/Section';

import LaunchDialogFigure from './LaunchDialogFigure';

interface Cell {
  ok: boolean;
  noteKey?: string;
}

const COMPARE_ROWS: { labelKey: string; offline: Cell; online: Cell }[] = [
  {
    labelKey: 'multiplayer',
    offline: { ok: true },
    online: { ok: false, noteKey: 'multiplayerOnline' },
  },
  {
    labelKey: 'latestData',
    offline: { ok: false, noteKey: 'latestDataOffline' },
    online: { ok: true },
  },
  { labelKey: 'points', offline: { ok: false }, online: { ok: true } },
  { labelKey: 'checkIn', offline: { ok: false }, online: { ok: true } },
  { labelKey: 'refresh', offline: { ok: false }, online: { ok: true } },
];

const CUSTOM_GAME_ID = '2307479570';

// 三张地图对应三个难度档，地图名让玩家自己填等于多一步出错机会
const LAUNCH_MODES = [
  { key: 'dota', name: 'Dota', map: 'dota' },
  { key: 'hard', name: 'Hard', map: 'hard' },
  { key: 'custom', name: 'Custom', map: 'custom' },
];

// steam://run 的启动参数整段要编码，+ 与空格原样传过去 Steam 收到的是空参数
const launchUrl = (map: string) =>
  `steam://run/570//%2Bdota_launch_custom_game%20${CUSTOM_GAME_ID}%20${map}/`;

const launchCommand = (map: string) => `dota_launch_custom_game ${CUSTOM_GAME_ID} ${map}`;

export default function LaunchPage() {
  const t = useTranslations('launch');

  const modeName = (chunks: React.ReactNode) => (
    <b className="font-medium text-heading">{chunks}</b>
  );

  const wait = (chunks: React.ReactNode) => <b className="font-medium text-warning">{chunks}</b>;

  // 能不能用一眼看完，所以正文只留符号；窄屏再加字会把模式列挤到折行
  const renderCell = (cell: Cell) => (
    <span className="inline-flex items-center gap-2 text-left">
      {cell.ok ? (
        <Check
          className="size-[18px] shrink-0 text-success md:size-5"
          strokeWidth={2.5}
          aria-label={t('compare.yes')}
        />
      ) : (
        <span
          className="shrink-0 text-lg leading-5 text-faint md:text-xl"
          aria-label={t('compare.no')}
        >
          —
        </span>
      )}
      {cell.noteKey ? (
        <span className="hidden text-sm text-muted md:inline">{t(`compare.${cell.noteKey}`)}</span>
      ) : null}
    </span>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <h1 className="title-primary">{t('title')}</h1>

      <Section title={t('site.title')}>
        <p className="text-content text-pretty">
          {t('site.lead')} <span className="font-medium text-warning">{t('site.warning')}</span>
        </p>
        <div className="mt-4 grid gap-2.5 md:grid-cols-3">
          {LAUNCH_MODES.map((mode) => (
            <a
              key={mode.key}
              href={launchUrl(mode.map)}
              className="card-container card-hover box-pad flex items-center gap-3"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium text-heading">{mode.name}</span>
                <span className="block text-[13px] text-muted">{t(`difficulty.${mode.key}`)}</span>
              </span>
              <Play className="size-[18px] shrink-0 text-link" aria-hidden="true" />
            </a>
          ))}
        </div>
      </Section>

      <Section title={t('dialogs.title')}>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2.5">
            <p className="text-content text-pretty">
              <span className="font-medium text-heading">1.</span> {t('dialogs.step1')}
            </p>
            <LaunchDialogFigure
              pill
              title={t('dialogs.browser.title')}
              body={t('dialogs.browser.body')}
              confirm={t('dialogs.browser.confirm')}
              cancel={t('dialogs.browser.cancel')}
            />
          </div>
          <div className="space-y-2.5">
            <p className="text-content text-pretty">
              <span className="font-medium text-heading">2.</span> {t('dialogs.step2')}
            </p>
            <LaunchDialogFigure
              title={t('dialogs.steam.title')}
              body={t('dialogs.steam.body')}
              params={`+${launchCommand('hard')}`}
              note={t('dialogs.steam.note')}
              confirm={t('dialogs.steam.confirm')}
              cancel={t('dialogs.steam.cancel')}
            />
            <p className="text-sm text-warning text-pretty">{t('dialogs.step2Hint')}</p>
          </div>
        </div>
        <p className="mt-5 flex items-start gap-2 text-content text-pretty">
          <span className="font-medium text-heading">3.</span>
          <Clock className="mt-1 size-[17px] shrink-0 text-warning" aria-hidden="true" />
          <span className="min-w-0 flex-1">{t.rich('dialogs.step3', { wait })}</span>
        </p>
      </Section>

      <Section title={t('compare.title')}>
        <div className="mb-5 space-y-2">
          <p className="text-content">{t('compare.lead')}</p>
          <p className="text-content text-pretty">
            {t.rich('compare.leadOffline', { name: modeName })}
          </p>
          <p className="text-content text-pretty">
            {t.rich('compare.leadOnline', { name: modeName })}
          </p>
        </div>
        <div className="w-full overflow-hidden rounded-[10px] border border-line bg-panel">
          <table className="w-full table-fixed">
            <thead>
              <tr className="border-b border-line bg-panel-raised">
                <th className="px-2 py-3 md:p-4" />
                <th scope="col" className="w-[76px] px-1.5 py-3 text-center md:w-[26%] md:p-4">
                  <span className="block text-sm font-bold text-heading md:text-lg">
                    {t('compare.offline')}
                  </span>
                  <span className="block text-[10px] leading-[15px] font-normal text-muted md:text-[13px] md:leading-5">
                    {t('compare.offlineHint')}
                  </span>
                </th>
                <th scope="col" className="w-[76px] px-1.5 py-3 text-center md:w-[26%] md:p-4">
                  <span className="block text-sm font-bold text-heading md:text-lg">
                    {t('compare.online')}
                  </span>
                  <span className="block text-[10px] leading-[15px] font-normal text-muted md:text-[13px] md:leading-5">
                    {t('compare.onlineHint')}
                  </span>
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
                  <td className="px-1.5 py-3 text-center md:p-4">{renderCell(row.offline)}</td>
                  <td className="px-1.5 py-3 text-center md:p-4">{renderCell(row.online)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 space-y-1.5 text-[13px] leading-[19px] text-muted md:text-sm md:leading-5">
          <p>{t('compare.noteModes')}</p>
          <p>{t('compare.noteTiming')}</p>
        </div>
      </Section>

      <Section title={t('website.title')}>
        <p className="text-content text-pretty">{t('website.body')}</p>
        <p className="mt-2 text-content text-pretty">{t('website.checkIn')}</p>
      </Section>

      <Section title={t('console.title')}>
        <p className="text-content text-pretty">{t('console.intro')}</p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-content marker:text-muted">
          {t.raw('console.steps').map((step: string) => (
            <li key={step} className="pl-1">
              {step}
            </li>
          ))}
        </ol>
        <div className="mt-4 space-y-2">
          {LAUNCH_MODES.map((mode) => (
            <div
              key={mode.key}
              className="box-pad flex flex-col gap-1.5 rounded-[10px] border border-line bg-panel-soft md:flex-row md:items-center md:gap-4"
            >
              <span className="flex items-baseline gap-2 md:w-38 md:shrink-0 md:flex-col md:items-start md:gap-0">
                <span className="text-[15px] font-medium text-heading">{mode.name}</span>
                <span className="text-[13px] text-muted">{t(`difficulty.${mode.key}`)}</span>
              </span>
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <code className="min-w-0 flex-1 font-mono text-sm break-all text-heading">
                  {launchCommand(mode.map)}
                </code>
                <CopyIdButton
                  value={launchCommand(mode.map)}
                  tooltip={t('console.copy')}
                  copiedLabel={t('console.copied')}
                />
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
