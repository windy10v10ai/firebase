import { apiFetch } from './api';

export const MEMBER_LEVEL_PREMIUM = 2;

// 以下类型照抄 API 响应，字段名保留 season；转成「勇士」只发生在界面文案里
export interface MemberInfo {
  enable: boolean;
  expireDateString: string;
  level: number;
}

export interface StatsLifetime {
  kills: number;
  deaths: number;
  assists: number;
  lastHits: number;
  heroDamage: number;
  damageTaken: number;
  healing: number;
  towerKills: number;
  totalGoldEarned: number;
}

export interface PropertyItem {
  name: string;
  level: number;
}

export interface PlayerInfo {
  id: string;
  matchCount: number;
  winCount: number;
  conductPoint: number;
  commendCount: number;
  reportCount: number;
  seasonLevel: number;
  seasonPointTotal: number;
  seasonCurrrentLevelPoint: number;
  seasonNextLevelPoint: number;
  useableSeasonPoint: number;
  memberLevel: number;
  memberPointTotal: number;
  memberCurrentLevelPoint: number;
  memberNextLevelPoint: number;
  useableMemberPoint: number;
  totalLevel: number;
  useableLevel: number;
  member?: MemberInfo;
  statsLifetime?: StatsLifetime;
  properties?: PropertyItem[];
}

/** 初始化属性点的价码，与 api 的 player-property.service.ts 保持一致 */
export const RESET_PROPERTY_SEASON_POINT_COST = 2000;
export const RESET_PROPERTY_MEMBER_POINT_COST = 1000;

/** 会员状态对应的文案 key：没有记录、已过期、高级、普通 */
export function memberStatusKey(member?: MemberInfo): string {
  if (!member) {
    return 'none';
  }
  if (!member.enable) {
    return 'expired';
  }
  return member.level >= MEMBER_LEVEL_PREMIUM ? 'premium' : 'normal';
}

/** 取个人主页要的全部数据，按 URL 里的 id 请求，不从登录态取 uid */
export function fetchPlayerInfo(steamId: string) {
  return apiFetch<PlayerInfo>(`/api/player/${steamId}/info?include=member,statsLifetime`);
}

/** 属性页要的数据，等级与可用积分本来就在响应里，一次请求够了 */
export function fetchPlayerProperties(steamId: string) {
  return apiFetch<PlayerInfo>(`/api/player/${steamId}/info?include=property`);
}

/** level 是升到的目标等级，不是增量 */
export function upgradeProperty(steamId: string, name: string, level: number) {
  return apiFetch<PlayerInfo>(`/api/player/${steamId}/property`, {
    method: 'PUT',
    body: JSON.stringify({ name, level }),
  });
}

export function resetProperties(steamId: string, useMemberPoint: boolean) {
  return apiFetch<PlayerInfo>(
    `/api/player/${steamId}/property?useMemberPoint=${useMemberPoint}`,
    { method: 'DELETE' },
  );
}
