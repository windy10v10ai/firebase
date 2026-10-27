// 只列有实质改动的发布版本，新的在前；说明文案在 messages 的 launch.changelog.entries，键名由版本号的点换成下划线
export const LAUNCHER_CHANGELOG: { version: string; date: string }[] = [
  { version: '0.7.1', date: '2026-10-26' },
  { version: '0.7.0', date: '2026-10-25' },
  { version: '0.6.2', date: '2026-10-13' },
  { version: '0.6.0', date: '2026-10-11' },
  { version: '0.5.3', date: '2026-10-09' },
  { version: '0.5.2', date: '2026-10-06' },
  { version: '0.5.0', date: '2026-10-06' },
  { version: '0.4.2', date: '2026-10-04' },
  { version: '0.4.1', date: '2026-10-04' },
  { version: '0.4.0', date: '2026-10-04' },
  { version: '0.3.4', date: '2026-10-03' },
  { version: '0.3.0', date: '2026-09-28' },
  { version: '0.2.0', date: '2026-09-27' },
];

export const changelogKey = (version: string) => `v${version.replaceAll('.', '_')}`;
