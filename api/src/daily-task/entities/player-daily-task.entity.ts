import { Exclude } from 'class-transformer';
import { Collection } from 'fireorm';

export interface CompletedTask {
  taskId: string;
  star: number;
}

export interface DailyTaskHistoryEntry {
  dayId: string;
  tasks: CompletedTask[];
  seasonPoint: number;
}

@Collection()
export class PlayerDailyTask {
  @Exclude()
  id: string;
  steamId: number;
  dayId: string;
  completedTasks: CompletedTask[] = [];
  todaySeasonPoint: number;
  /** 本轮已用刷新次数，完成一轮与跨天时归零 */
  refreshCount: number = 0;
  history: DailyTaskHistoryEntry[] = [];
  updatedAt: Date;
}
