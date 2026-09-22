import PlayerAvatar from '@/app/components/PlayerAvatar';

import type { RankedPlayer } from '@/app/lib/leaderboard';
import type { Ref } from 'react';

interface LeaderboardRowProps {
  ref?: Ref<HTMLLIElement>;
  rank: number;
  player: RankedPlayer;
  isMe: boolean;
}

// 前三名不用金银铜：金色在全站只表示会员，紫色只留给「自己」
const TOP_RANK_CLASS =
  'inline-flex size-8 items-center justify-center rounded-lg border border-line-strong bg-panel-raised font-bold text-heading';

export default function LeaderboardRow({ ref, rank, player, isMe }: LeaderboardRowProps) {
  return (
    <li
      ref={ref}
      aria-current={isMe ? 'true' : undefined}
      className={`flex h-13 items-center gap-3 border-b border-panel-raised px-3 md:h-14 md:px-4 ${
        isMe ? 'bg-season-soft shadow-[inset_2px_0_0_var(--color-season-strong)]' : ''
      }`}
    >
      <span className="flex w-11 shrink-0">
        {rank <= 3 ? (
          <span className={TOP_RANK_CLASS}>{rank}</span>
        ) : (
          <span className={`pl-1 ${isMe ? 'font-bold text-season' : 'font-medium text-content'}`}>
            {rank}
          </span>
        )}
      </span>
      <PlayerAvatar
        avatarUrl={player.avatarUrl}
        imageClassName="size-9 shrink-0 rounded-lg md:size-10"
        iconClassName="size-9 shrink-0 rounded-lg bg-panel-soft p-2 text-muted md:size-10"
      />
      <span className={`min-w-0 flex-1 truncate ${isMe ? 'font-bold text-heading' : 'text-content'}`}>
        {player.personaName ?? player.steamId}
      </span>
    </li>
  );
}
