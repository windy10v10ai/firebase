import { Injectable } from '@nestjs/common';
import { logger } from 'firebase-functions';

import { GameEndPlayerDto } from '../../analytics/dto/game-end-dto';
import { getUtcDayId } from '../../util/date';
import { ROUNDS_PER_DAY } from '../config/tasks';
import { DailyTaskSnapshotDto } from '../dto/daily-task-snapshot.dto';
import { PlayerDailyTask } from '../entities/player-daily-task.entity';

import { DailyTaskGenerationService } from './daily-task-generation.service';
import { DailyTaskStore } from './daily-task.store';

const HISTORY_MAX_ENTRIES = 30;

@Injectable()
export class DailyTaskService {
  constructor(
    private readonly store: DailyTaskStore,
    private readonly generationService: DailyTaskGenerationService,
  ) {}

  async getSnapshots(steamIds: number[]): Promise<DailyTaskSnapshotDto[]> {
    const dayId = getUtcDayId();
    const snapshots = await Promise.all(
      steamIds.map(async (steamId) => {
        try {
          return await this.getSnapshot(steamId, dayId);
        } catch (error) {
          logger.warn('game/start: daily task snapshot failed', {
            steamId,
            error: error instanceof Error ? error.message : String(error),
          });
          return undefined;
        }
      }),
    );
    return snapshots.filter((snapshot): snapshot is DailyTaskSnapshotDto => snapshot !== undefined);
  }

  async getSnapshot(steamId: number, today = getUtcDayId()): Promise<DailyTaskSnapshotDto> {
    const document = await this.store.transact(steamId, (current) => {
      const normalized = current ? this.normalize(current) : this.createDocument(steamId, today);
      const next = normalized.dayId === today ? normalized : this.resetForNewDay(normalized, today);
      const shouldWrite = !current || next !== normalized;
      return { result: next, ...(shouldWrite ? { next } : {}) };
    });

    const storedCompletedTasks = document.completedTasks.map((task) => ({ ...task }));
    const candidates =
      storedCompletedTasks.length >= ROUNDS_PER_DAY
        ? []
        : this.generationService.generateCandidates(
            document.dayId,
            steamId,
            storedCompletedTasks.length + 1,
            storedCompletedTasks.map((task) => task.taskId),
          );

    const completedTasks = storedCompletedTasks
      .map((task) => this.generationService.resolveCompletedTask(task))
      .filter((task): task is NonNullable<typeof task> => task !== undefined);

    return {
      steamId,
      dayId: document.dayId,
      candidates,
      completedTasks,
      todaySeasonPoint: document.todaySeasonPoint,
      history: document.history.map((entry) => ({
        dayId: entry.dayId,
        tasks: entry.tasks
          .map((task) => this.generationService.resolveCompletedTask(task))
          .filter((task): task is NonNullable<typeof task> => task !== undefined),
        seasonPoint: entry.seasonPoint,
      })),
    };
  }

  async recordGameEnd(players: GameEndPlayerDto[]): Promise<void> {
    await Promise.all(players.map((player) => this.recordPlayerSafely(player)));
  }

  private async recordPlayerSafely(player: GameEndPlayerDto): Promise<void> {
    if (player.steamId <= 0 || player.isDisconnected || !player.dailyTask) {
      return;
    }
    const { dayId, taskId, star, seasonPoint } = player.dailyTask;
    if (
      dayId === undefined ||
      taskId === undefined ||
      star === undefined ||
      seasonPoint === undefined
    ) {
      logger.warn('game/end: incomplete daily task result', { steamId: player.steamId, dayId });
      return;
    }

    try {
      await this.store.transact(player.steamId, (current) => {
        if (!current) {
          logger.warn('game/end: daily task document missing', { steamId: player.steamId, dayId });
          return { result: undefined };
        }

        const document = this.normalize(current);
        if (document.dayId !== dayId) {
          logger.warn('game/end: daily task dayId mismatch', {
            steamId: player.steamId,
            expectedDayId: document.dayId,
            receivedDayId: dayId,
          });
          return { result: undefined };
        }
        if (document.completedTasks.some((task) => task.taskId === taskId)) {
          return { result: undefined };
        }
        if (document.completedTasks.length >= ROUNDS_PER_DAY) {
          logger.warn('game/end: daily task rounds already complete', {
            steamId: player.steamId,
            dayId,
          });
          return { result: undefined };
        }

        const next: PlayerDailyTask = {
          ...document,
          completedTasks: [...document.completedTasks, { taskId, star }],
          todaySeasonPoint: document.todaySeasonPoint + seasonPoint,
          updatedAt: new Date(),
        };
        return { result: undefined, next };
      });
    } catch (error) {
      logger.warn('game/end: daily task recording failed', {
        steamId: player.steamId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private createDocument(steamId: number, dayId: string): PlayerDailyTask {
    return {
      id: steamId.toString(),
      steamId,
      dayId,
      completedTasks: [],
      todaySeasonPoint: 0,
      history: [],
      updatedAt: new Date(),
    };
  }

  private normalize(document: PlayerDailyTask): PlayerDailyTask {
    return {
      ...document,
      completedTasks: document.completedTasks ?? [],
      todaySeasonPoint: document.todaySeasonPoint ?? 0,
      history: document.history ?? [],
    };
  }

  private resetForNewDay(document: PlayerDailyTask, dayId: string): PlayerDailyTask {
    const history = [...document.history];
    if (document.dayId && document.completedTasks.length > 0) {
      history.unshift({
        dayId: document.dayId,
        tasks: document.completedTasks.map((task) => ({ ...task })),
        seasonPoint: document.todaySeasonPoint,
      });
    }

    return {
      ...document,
      dayId,
      completedTasks: [],
      todaySeasonPoint: 0,
      history: history.slice(0, HISTORY_MAX_ENTRIES),
      updatedAt: new Date(),
    };
  }
}
