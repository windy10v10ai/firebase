'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { updateProfileVisibility, type PlayerInfo } from '@/app/lib/player-info';
import { playerInfoQuery } from '@/app/lib/queries';

/** 本人主页上的公开开关；数据没到时按默认的公开画，点不了 */
export default function VisibilitySwitch({
  steamId,
  info,
}: {
  steamId: string;
  info: PlayerInfo | null;
}) {
  const t = useTranslations('profile.visibility');
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const isPublic = !info?.profileHidden;

  const handleToggle = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const { profileHidden } = await updateProfileVisibility(steamId, isPublic);
      queryClient.setQueryData<PlayerInfo>(playerInfoQuery(steamId).queryKey, (current) =>
        current ? { ...current, profileHidden } : current,
      );
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="flex min-w-0 items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={isPublic}
        disabled={!info || busy}
        onClick={handleToggle}
        className="inline-flex h-9 items-center gap-2 text-sm text-muted transition-colors hover:text-content disabled:opacity-60"
      >
        {t('label')}
        <span
          aria-hidden="true"
          className={`relative h-4.5 w-7.5 shrink-0 rounded-full transition-colors ${isPublic ? 'bg-link' : 'bg-line-strong'}`}
        >
          <span
            className={`absolute top-0.5 size-3.5 rounded-full transition-all ${
              isPublic ? 'left-3.5 bg-heading' : 'left-0.5 bg-muted'
            }`}
          />
        </span>
      </button>
      {failed ? (
        <span role="alert" className="truncate text-xs text-danger">
          {t('failed')}
        </span>
      ) : null}
    </span>
  );
}
