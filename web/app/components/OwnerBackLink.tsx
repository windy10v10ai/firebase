'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { playerPagePath } from '@/app/lib/player-path';
import { useSteamProfile } from '@/app/lib/use-steam-profile';

import PlayerAvatar from './PlayerAvatar';

/** 看别人的属性、觉醒页时标明这是谁的，并能回到他的个人主页 */
export default function OwnerBackLink({ steamId }: { steamId: string }) {
  const t = useTranslations('profile');
  const profile = useSteamProfile(steamId);
  const name = profile?.personaName ?? t('identity.heading', { id: steamId });

  return (
    <Link
      href={playerPagePath(steamId)}
      className="inline-flex max-w-full items-center gap-2 text-sm text-content link-hover"
    >
      <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
      <PlayerAvatar
        avatarUrl={profile?.avatarUrl}
        imageClassName="size-5 shrink-0 rounded-full object-cover"
        iconClassName="size-5 shrink-0 text-muted"
      />
      <span className="truncate">{t('ownerLink', { name })}</span>
    </Link>
  );
}
