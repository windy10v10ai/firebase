// 只列有实质改动的发布版本，新的在前；说明文案在 messages 的 launch.changelog.entries，键名由版本号的点换成下划线
export const LAUNCHER_CHANGELOG: { version: string; date: string }[] = [
  { version: '0.5.1', date: '2026-10-06' },
  { version: '0.5.0', date: '2026-10-06' },
  { version: '0.4.3', date: '2026-10-05' },
  { version: '0.4.2', date: '2026-10-04' },
  { version: '0.4.1', date: '2026-10-04' },
  { version: '0.4.0', date: '2026-10-04' },
  { version: '0.3.4', date: '2026-10-03' },
  { version: '0.3.2', date: '2026-09-28' },
  { version: '0.3.0', date: '2026-09-28' },
  { version: '0.2.0', date: '2026-09-27' },
];

export const changelogKey = (version: string) => `v${version.replaceAll('.', '_')}`;
