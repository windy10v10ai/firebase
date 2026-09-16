import { useTranslations } from 'next-intl';

import CopyIdButton from '../components/CopyIdButton';
import Section from '../components/Section';

interface CompareRow {
  label: string;
  offline: string;
  online: string;
}

/** 列头：模式名在上，怎么开局在下，让玩家把名字和操作对上 */
function ModeHead({ name, hint }: { name: string; hint: string }) {
  return (
    <>
      <span className="block font-medium text-heading">{name}</span>
      <span className="block text-xs font-normal text-muted">{hint}</span>
    </>
  );
}

export default function OfflinePage() {
  const t = useTranslations('offline');
  const rows: CompareRow[] = t.raw('compare.rows');
  const steps: string[] = t.raw('online.steps');
  const command = t('online.command');

  const modes = [
    { key: 'offline', name: t('compare.offline'), hint: t('compare.offlineHint') },
    { key: 'online', name: t('compare.online'), hint: t('compare.onlineHint') },
  ] as const;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <section className="space-y-4">
        <h1 className="title-primary">{t('title')}</h1>
        <p className="text-content">{t('lead')}</p>
      </section>

      <Section title={t('compare.title')}>
        <div className="w-full overflow-hidden rounded-[10px] border border-line bg-panel">
          <table className="hidden w-full md:table">
            <thead>
              <tr className="border-b border-line bg-panel-raised">
                <th scope="col" className="w-1/3 px-4 py-3 text-left font-medium text-muted">
                  {t('compare.item')}
                </th>
                {modes.map((mode) => (
                  <th key={mode.key} scope="col" className="px-4 py-3 text-left">
                    <ModeHead name={mode.name} hint={mode.hint} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={row.label}
                  className={`border-b border-line last:border-b-0 ${
                    index % 2 === 0 ? 'bg-panel' : 'bg-panel-soft'
                  }`}
                >
                  <th scope="row" className="px-4 py-4 text-left align-top font-medium text-heading">
                    {row.label}
                  </th>
                  {modes.map((mode) => (
                    <td key={mode.key} className="px-4 py-4 align-top text-content">
                      {row[mode.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {/* 窄屏放不下三列，改成每项一块，两种模式各占一行 */}
          <dl className="divide-y divide-line md:hidden">
            {rows.map((row, index) => (
              <div
                key={row.label}
                className={`px-4 py-4 ${index % 2 === 0 ? 'bg-panel' : 'bg-panel-soft'}`}
              >
                <dt className="font-medium text-heading">{row.label}</dt>
                <dd className="mt-2 space-y-2">
                  {modes.map((mode) => (
                    <div key={mode.key}>
                      <p className="text-xs text-muted">{mode.name}</p>
                      <p className="text-content">{row[mode.key]}</p>
                    </div>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </Section>

      <Section title={t('online.title')}>
        <ol className="list-decimal space-y-2 pl-5 text-content marker:text-muted">
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <div className="box-pad mt-4 flex items-center gap-2 rounded-[10px] border border-line bg-panel-soft">
          <code className="min-w-0 flex-1 break-all font-mono text-sm text-heading">{command}</code>
          <CopyIdButton value={command} tooltip={t('online.copy')} copiedLabel={t('online.copied')} />
        </div>
      </Section>

      <Section title={t('website.title')}>
        <p className="text-content">{t('website.body')}</p>
      </Section>
    </div>
  );
}
