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
  history: DailyTaskHistoryEntry[] = [];
  updatedAt: Date;
}
