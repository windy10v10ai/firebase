import { hashKey, queryOptions, type QueryClient, type QueryKey } from '@tanstack/react-query';

import { fetchPlayerAwakening } from './awaken';
import { fetchDailyTask } from './daily-task';
import { fetchBattleRank, fetchLeaderboard } from './leaderboard';
import { fetchPlayerInfo, fetchPlayerMember, fetchPlayerProperties } from './player-info';
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

/** 某个玩家全部缓存的公共前缀 */
export function playerKey(steamId: string) {
  return ['player', steamId] as const;
}

/** 会被网站写操作改变的那组数据，写操作后按它整体失效 */
export function playerStateKey(steamId: string) {
  return [...playerKey(steamId), 'state'] as const;
}

export function playerInfoQuery(steamId: string) {
  return queryOptions({
    queryKey: [...playerStateKey(steamId), 'info'],
    queryFn: () => fetchPlayerInfo(steamId),
    ...CACHE_TIERS.short,
  });
}

export function playerPropertiesQuery(steamId: string) {
  return queryOptions({
    queryKey: [...playerStateKey(steamId), 'properties'],
    queryFn: () => fetchPlayerProperties(steamId),
    ...CACHE_TIERS.realtime,
  });
}

export function playerAwakeningQuery(steamId: string) {
  return queryOptions({
    queryKey: [...playerStateKey(steamId), 'awakening'],
    queryFn: () => fetchPlayerAwakening(steamId),
    ...CACHE_TIERS.realtime,
  });
}

export function playerMemberQuery(steamId: string) {
  return queryOptions({
    queryKey: [...playerStateKey(steamId), 'member'],
    queryFn: () => fetchPlayerMember(steamId),
    ...CACHE_TIERS.realtime,
  });
}

export function dailyTaskQuery(steamId: string) {
  return queryOptions({
    queryKey: [...playerKey(steamId), 'daily-task'],
    queryFn: () => fetchDailyTask(steamId),
    ...CACHE_TIERS.realtime,
    // 这条读取会顺带写库，切回窗口不重新请求；页面上有刷新按钮
    refetchOnWindowFocus: false,
  });
}

/** 个人主页入口卡只看今天完成了几个，和任务页共用同一份数据，但按短缓存复用 */
export function dailyTaskPreviewQuery(steamId: string) {
  return queryOptions({
    ...dailyTaskQuery(steamId),
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
    ...CACHE_TIERS.long,
  });
}

export function battleRankQuery(steamId: string) {
  return queryOptions({
    queryKey: [...playerKey(steamId), 'rank'],
    queryFn: () => fetchBattleRank(steamId),
    ...CACHE_TIERS.long,
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

/** 写操作成功后调用：该玩家的状态组过期，正在显示的立即后台刷新；战绩、名次、昵称头像不受网站操作影响，不动 */
export function invalidatePlayerState(client: QueryClient, steamId: string) {
  return client.invalidateQueries({ queryKey: playerStateKey(steamId) });
}

/** 写接口返回了最新数据时用：直接写进对应缓存，该玩家状态组的其余缓存过期 */
export function applyPlayerWrite<T>(client: QueryClient, steamId: string, queryKey: QueryKey, data: T) {
  client.setQueryData(queryKey, data);
  // 刚写进去的就是最新值，跟着失效会多发一次同样的请求
  const written = hashKey(queryKey);
  return client.invalidateQueries({
    queryKey: playerStateKey(steamId),
    predicate: (query) => query.queryHash !== written,
  });
}
