import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import {
  applyPlayerWrite,
  CACHE_TIERS,
  invalidatePlayer,
  leaderboardQuery,
  playerInfoQuery,
  recentMatchesQuery,
  statsRadarQuery,
  battleRankQuery,
  steamProfileQuery,
} from './queries';

const PLAYER = '123';
const OTHER = '456';

describe('分档与 key', () => {
  it('玩家数据都挂在该玩家的前缀下', () => {
    for (const query of [
      playerInfoQuery(PLAYER),
      recentMatchesQuery(PLAYER),
      statsRadarQuery(PLAYER),
      battleRankQuery(PLAYER),
      steamProfileQuery(PLAYER),
    ]) {
      expect(query.queryKey.slice(0, 2)).toEqual(['player', PLAYER]);
    }
  });

  it('看的数据走短缓存，昵称头像与排行榜走长缓存', () => {
    for (const query of [
      playerInfoQuery(PLAYER),
      recentMatchesQuery(PLAYER),
      statsRadarQuery(PLAYER),
      battleRankQuery(PLAYER),
    ]) {
      expect(query.staleTime).toBe(CACHE_TIERS.short.staleTime);
    }
    expect(steamProfileQuery(PLAYER)).toMatchObject(CACHE_TIERS.long);
    expect(leaderboardQuery()).toMatchObject(CACHE_TIERS.long);
  });

  it('实时档不留缓存', () => {
    expect(CACHE_TIERS.realtime).toEqual({ staleTime: 0, gcTime: 0 });
  });

  it('长缓存的回收时间不短于新鲜期', () => {
    expect(CACHE_TIERS.long.gcTime).toBeGreaterThanOrEqual(CACHE_TIERS.long.staleTime);
  });
});

function seed(client: QueryClient) {
  const keys: Record<'info' | 'recent' | 'otherInfo' | 'leaderboard', readonly unknown[]> = {
    info: playerInfoQuery(PLAYER).queryKey,
    recent: recentMatchesQuery(PLAYER).queryKey,
    otherInfo: playerInfoQuery(OTHER).queryKey,
    leaderboard: leaderboardQuery().queryKey,
  };
  for (const key of Object.values(keys)) {
    client.setQueryData(key, { seeded: true });
  }
  return keys;
}

const invalidated = (client: QueryClient, key: readonly unknown[]) =>
  client.getQueryState(key)?.isInvalidated;

describe('写操作后的失效', () => {
  it('invalidatePlayer 只让该玩家的缓存过期', async () => {
    const client = new QueryClient();
    const keys = seed(client);

    await invalidatePlayer(client, PLAYER);

    expect(invalidated(client, keys.info)).toBe(true);
    expect(invalidated(client, keys.recent)).toBe(true);
    expect(invalidated(client, keys.otherInfo)).toBe(false);
    expect(invalidated(client, keys.leaderboard)).toBe(false);
  });

  it('applyPlayerWrite 写入返回值，该玩家其余缓存过期', async () => {
    const client = new QueryClient();
    const keys = seed(client);
    const fresh = { fresh: true };

    await applyPlayerWrite(client, PLAYER, keys.info, fresh);

    expect(client.getQueryData(keys.info)).toEqual(fresh);
    expect(invalidated(client, keys.info)).toBe(false);
    expect(invalidated(client, keys.recent)).toBe(true);
    expect(invalidated(client, keys.otherInfo)).toBe(false);
    expect(invalidated(client, keys.leaderboard)).toBe(false);
  });
});
