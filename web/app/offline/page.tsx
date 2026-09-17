import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';

import CopyIdButton from '../components/CopyIdButton';
import Section from '../components/Section';

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

// 三张地图对应三个难度档，直接给出整条命令，玩家不用自己拼地图名
const LAUNCH_COMMANDS = [
  { key: 'dota', name: 'Dota', command: 'dota_launch_custom_game 2307479570 dota' },
  { key: 'hard', name: 'Hard', command: 'dota_launch_custom_game 2307479570 hard' },
  { key: 'custom', name: 'Custom', command: 'dota_launch_custom_game 2307479570 custom' },
];

export default function OfflinePage() {
  const t = useTranslations('offline');

  const modeName = (chunks: React.ReactNode) => (
    <b className="font-medium text-heading">{chunks}</b>
  );

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
        <span className="shrink-0 text-lg leading-5 text-faint md:text-xl" aria-label={t('compare.no')}>
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
      <section className="space-y-4">
        <h1 className="title-primary">{t('title')}</h1>
        <p className="text-content">{t('lead')}</p>
        <div className="space-y-2">
          <p className="text-content text-pretty">{t.rich('leadOffline', { name: modeName })}</p>
          <p className="text-content text-pretty">{t.rich('leadOnline', { name: modeName })}</p>
        </div>
      </section>

      <Section title={t('compare.title')}>
        <div className="w-full overflow-hidden rounded-[10px] border border-line bg-panel">
          <table className="w-full table-fixed">
            <thead>
              <tr className="border-b border-line bg-panel-raised">
                <th className="px-2 py-3 md:p-4" />
                <th
                  scope="col"
                  className="w-[76px] px-1.5 py-3 text-center md:w-[26%] md:p-4"
                >
                  <span className="block text-sm font-bold text-heading md:text-lg">
                    {t('compare.offline')}
                  </span>
                  <span className="block text-[10px] leading-[15px] font-normal text-muted md:text-[13px] md:leading-5">
                    {t('compare.offlineHint')}
                  </span>
                </th>
                <th
                  scope="col"
                  className="w-[76px] px-1.5 py-3 text-center md:w-[26%] md:p-4"
                >
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

      <Section title={t('online.title')}>
        <ol className="list-decimal space-y-2 pl-5 text-content marker:text-muted">
          {t.raw('online.steps').map((step: string) => (
            <li key={step} className="pl-1">
              {step}
            </li>
          ))}
        </ol>
        <div className="mt-4 space-y-2">
          {LAUNCH_COMMANDS.map((item) => (
            <div
              key={item.key}
              className="box-pad flex flex-col gap-1.5 rounded-[10px] border border-line bg-panel-soft md:flex-row md:items-center md:gap-4"
            >
              <span className="flex items-baseline gap-2 md:w-38 md:shrink-0 md:flex-col md:items-start md:gap-0">
                <span className="text-[15px] font-medium text-heading">{item.name}</span>
                <span className="text-[13px] text-muted">{t(`online.difficulty.${item.key}`)}</span>
              </span>
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <code className="min-w-0 flex-1 break-all font-mono text-sm text-heading">
                  {item.command}
                </code>
                <CopyIdButton
                  value={item.command}
                  tooltip={t('online.copy')}
                  copiedLabel={t('online.copied')}
                />
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title={t('website.title')}>
        <p className="text-content text-pretty">{t('website.body')}</p>
        <p className="mt-2 text-content text-pretty">{t('website.checkIn')}</p>
      </Section>
    </div>
  );
}
