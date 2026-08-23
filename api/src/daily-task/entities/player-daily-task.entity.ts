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
  /** Refreshes already used in the current round. Reset on completion and on a new day. */
  refreshCount: number = 0;
  history: DailyTaskHistoryEntry[] = [];
  updatedAt: Date;
}
