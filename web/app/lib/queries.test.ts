import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import {
  applyPlayerWrite,
  battleRankQuery,
  CACHE_TIERS,
  dailyTaskPreviewQuery,
  dailyTaskQuery,
  invalidatePlayerState,
  leaderboardQuery,
  playerAwakeningQuery,
  playerInfoQuery,
  playerMemberQuery,
  playerPropertiesQuery,
  recentMatchesQuery,
  statsRadarQuery,
  steamProfileQuery,
} from './queries';

const PLAYER = '123';
const OTHER = '456';

describe('分档与 key', () => {
  it('网站写操作会改变的数据挂在该玩家的状态组下', () => {
    for (const query of [
      playerInfoQuery(PLAYER),
      playerPropertiesQuery(PLAYER),
      playerAwakeningQuery(PLAYER),
      playerMemberQuery(PLAYER),
    ]) {
      expect(query.queryKey.slice(0, 3)).toEqual(['player', PLAYER, 'state']);
    }
  });

  it('写操作改不了的数据挂在玩家前缀下、状态组之外', () => {
    for (const query of [
      recentMatchesQuery(PLAYER),
      statsRadarQuery(PLAYER),
      battleRankQuery(PLAYER),
      steamProfileQuery(PLAYER),
      dailyTaskQuery(PLAYER),
    ]) {
      expect(query.queryKey.slice(0, 2)).toEqual(['player', PLAYER]);
      expect(query.queryKey[2]).not.toBe('state');
    }
  });

  it('各数据的档位', () => {
    expect(playerInfoQuery(PLAYER).staleTime).toBe(CACHE_TIERS.short.staleTime);
    expect(recentMatchesQuery(PLAYER).staleTime).toBe(CACHE_TIERS.short.staleTime);
    for (const query of [
      statsRadarQuery(PLAYER),
      battleRankQuery(PLAYER),
      steamProfileQuery(PLAYER),
      leaderboardQuery(),
    ]) {
      expect(query).toMatchObject(CACHE_TIERS.long);
    }
    for (const query of [
      playerPropertiesQuery(PLAYER),
      playerAwakeningQuery(PLAYER),
      playerMemberQuery(PLAYER),
      dailyTaskQuery(PLAYER),
    ]) {
      expect(query).toMatchObject(CACHE_TIERS.realtime);
    }
  });

  it('每日任务切回窗口不重新请求', () => {
    expect(dailyTaskQuery(PLAYER).refetchOnWindowFocus).toBe(false);
    expect(dailyTaskPreviewQuery(PLAYER).refetchOnWindowFocus).toBe(false);
  });

  it('入口卡与任务页共用同一份每日任务，入口卡走短缓存', () => {
    expect(dailyTaskPreviewQuery(PLAYER).queryKey).toEqual(dailyTaskQuery(PLAYER).queryKey);
    expect(dailyTaskPreviewQuery(PLAYER).staleTime).toBe(CACHE_TIERS.short.staleTime);
  });

  it('长缓存的回收时间不短于新鲜期', () => {
    expect(CACHE_TIERS.long.gcTime).toBeGreaterThanOrEqual(CACHE_TIERS.long.staleTime);
  });
});

type SeedName = 'info' | 'properties' | 'recent' | 'rank' | 'otherInfo' | 'leaderboard';

function seed(client: QueryClient) {
  const keys: Record<SeedName, readonly unknown[]> = {
    info: playerInfoQuery(PLAYER).queryKey,
    properties: playerPropertiesQuery(PLAYER).queryKey,
    recent: recentMatchesQuery(PLAYER).queryKey,
    rank: battleRankQuery(PLAYER).queryKey,
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
  it('invalidatePlayerState 只让该玩家的状态组过期', async () => {
    const client = new QueryClient();
    const keys = seed(client);

    await invalidatePlayerState(client, PLAYER);

    expect(invalidated(client, keys.info)).toBe(true);
    expect(invalidated(client, keys.properties)).toBe(true);
    expect(invalidated(client, keys.recent)).toBe(false);
    expect(invalidated(client, keys.rank)).toBe(false);
    expect(invalidated(client, keys.otherInfo)).toBe(false);
    expect(invalidated(client, keys.leaderboard)).toBe(false);
  });

  it('applyPlayerWrite 写入返回值，状态组其余缓存过期', async () => {
    const client = new QueryClient();
    const keys = seed(client);
    const fresh = { fresh: true };

    await applyPlayerWrite(client, PLAYER, keys.properties, fresh);

    expect(client.getQueryData(keys.properties)).toEqual(fresh);
    expect(invalidated(client, keys.properties)).toBe(false);
    expect(invalidated(client, keys.info)).toBe(true);
    expect(invalidated(client, keys.recent)).toBe(false);
    expect(invalidated(client, keys.rank)).toBe(false);
    expect(invalidated(client, keys.otherInfo)).toBe(false);
  });
});
