'use client';

import { useSyncExternalStore } from 'react';

const subscribeNothing = () => () => {};

export default function TokenValue({ name }: { name: string }) {
  const value = useSyncExternalStore(
    subscribeNothing,
    () => getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
    () => '',
  );

  return <span className="font-mono text-xs break-all text-muted">{value || ' '}</span>;
}
