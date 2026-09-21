import { apiFetch } from './api';

export type TaskScope = 'personal_general' | 'personal_hero';

export type TaskMetric =
  | 'kills'
  | 'assists'
  | 'last_hits'
  | 'tower_kills'
  | 'hero_damage'
  | 'healing'
  | 'total_gold_earned'
  | 'damage_taken'
  | 'stun_duration'
  | 'roshan_kills';

export interface TaskCandidate {
  taskId: string;
  scope: TaskScope;
  metric: TaskMetric;
  /** 只有 personal_hero 才有 */
  heroName?: string;
  star: number;
  target: number;
  rewardSeasonPoint: number;
}

export interface DailyTaskHistoryEntry {
  dayId: string;
  tasks: TaskCandidate[];
  seasonPoint: number;
}

export interface DailyTaskSnapshot {
  steamId: number;
  /** UTC 天号，YYYYMMDD */
  dayId: string;
  candidates: TaskCandidate[];
  completedTasks: TaskCandidate[];
  todaySeasonPoint: number;
  refreshRemaining: number;
  /** 刷新的响应不带这个字段，调用方要保留手上那份 */
  history?: DailyTaskHistoryEntry[];
}

/** 今天与 30 天历史一次拿全。这条 GET 会在跨天时补一次归档，不是纯读取 */
export function fetchDailyTask(steamId: string) {
  return apiFetch<DailyTaskSnapshot>(`/api/daily-task/${steamId}`);
}

/** 重掷本轮的 3 个任务，每轮只能用一次 */
export function refreshDailyTask(steamId: string, dayId: string) {
  return apiFetch<DailyTaskSnapshot>(`/api/daily-task/${steamId}/refresh`, {
    method: 'POST',
    body: JSON.stringify({ dayId }),
  });
}
