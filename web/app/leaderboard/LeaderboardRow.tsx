import PlayerAvatar from '@/app/components/PlayerAvatar';

import type { RankedPlayer } from '@/app/lib/leaderboard';
import type { Ref } from 'react';

interface LeaderboardRowProps {
  ref?: Ref<HTMLLIElement>;
  rank: number;
  player: RankedPlayer;
  isMe: boolean;
}

// 靠前的名次都值得标出来，按 1 / 10 / 100 分档；勇士紫留给「自己」那一行
function rankChipClass(rank: number): string {
  if (rank === 1) {
    return 'bg-member-soft font-bold text-member-strong ring-1 ring-inset ring-member-border';
  }
  if (rank <= 10) {
    return 'bg-heading/10 font-bold text-heading';
  }
  if (rank <= 100) {
    return 'bg-panel-soft font-medium text-content';
  }
  return 'text-muted';
}

export default function LeaderboardRow({ ref, rank, player, isMe }: LeaderboardRowProps) {
  return (
    <li
      ref={ref}
      aria-current={isMe ? 'true' : undefined}
      className={`flex h-13 items-center gap-3 border-b border-panel-raised px-3 md:h-14 md:px-4 ${
        isMe ? 'bg-season-soft shadow-[inset_2px_0_0_var(--color-season-strong)]' : ''
      }`}
    >
      {/* 胶囊同宽、数字居中，位数从 1 位变到 3 位也不错位 */}
      <span className={`inline-block h-6.5 w-11 shrink-0 rounded-full text-center text-sm leading-6.5 ${rankChipClass(rank)}`}>
        {rank}
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
