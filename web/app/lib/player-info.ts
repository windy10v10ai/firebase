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
}

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
