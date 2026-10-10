import { hashKey, queryOptions, type QueryClient, type QueryKey } from '@tanstack/react-query';

import { fetchBattleRank, fetchLeaderboard } from './leaderboard';
import { fetchPlayerInfo } from './player-info';
import { fetchStatsRadar } from './player-stats-radar';
import { fetchRecentMatches } from './player-stats-recent';
import { fetchSteamProfile } from './steam-profile';

const MINUTE = 60_000;

// 页面只选档不填数字，同类数据的新鲜度才不会各页不一致；分档理由见 docs/web/README.md「数据缓存」
export const CACHE_TIERS = {
  // 玩家来这些页面是为了操作，旧值会让人按错，离开就丢掉，再进来也不先闪旧值
  realtime: { staleTime: 0, gcTime: 0 },
  short: { staleTime: MINUTE },
  // 回收时间不短于新鲜期，否则没人用的数据在新鲜期内就被回收，等于没缓存
  long: { staleTime: 30 * MINUTE, gcTime: 30 * MINUTE },
} as const;

/** 某个玩家全部缓存的公共前缀，写操作后按它整体失效 */
export function playerKey(steamId: string) {
  return ['player', steamId] as const;
}

export function playerInfoQuery(steamId: string) {
  return queryOptions({
    queryKey: [...playerKey(steamId), 'info'],
    queryFn: () => fetchPlayerInfo(steamId),
    ...CACHE_TIERS.short,
  });
}

export function recentMatchesQuery(steamId: string) {
  return queryOptions({
    queryKey: [...playerKey(steamId), 'stats-recent'],
    queryFn: () => fetchRecentMatches(steamId),
    ...CACHE_TIERS.short,
  });
}

export function statsRadarQuery(steamId: string) {
  return queryOptions({
    queryKey: [...playerKey(steamId), 'stats-radar'],
    queryFn: () => fetchStatsRadar(steamId),
    ...CACHE_TIERS.short,
  });
}

export function battleRankQuery(steamId: string) {
  return queryOptions({
    queryKey: [...playerKey(steamId), 'rank'],
    queryFn: () => fetchBattleRank(steamId),
    ...CACHE_TIERS.short,
  });
}

export function steamProfileQuery(steamId: string) {
  return queryOptions({
    queryKey: [...playerKey(steamId), 'steam-profile'],
    queryFn: () => fetchSteamProfile(steamId),
    ...CACHE_TIERS.long,
  });
}

export function leaderboardQuery() {
  return queryOptions({
    queryKey: ['leaderboard'],
    queryFn: fetchLeaderboard,
    ...CACHE_TIERS.long,
  });
}

/** 写操作成功后调用：该玩家的缓存全部过期，正在显示的立即后台刷新 */
export function invalidatePlayer(client: QueryClient, steamId: string) {
  return client.invalidateQueries({ queryKey: playerKey(steamId) });
}

/** 写接口返回了最新数据时用：直接写进对应缓存，该玩家的其余缓存过期 */
export function applyPlayerWrite<T>(client: QueryClient, steamId: string, queryKey: QueryKey, data: T) {
  client.setQueryData(queryKey, data);
  // 刚写进去的就是最新值，跟着失效会多发一次同样的请求
  const written = hashKey(queryKey);
  return client.invalidateQueries({
    queryKey: playerKey(steamId),
    predicate: (query) => query.queryHash !== written,
  });
}
