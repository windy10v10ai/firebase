import { GameEndPlayerDto } from '../../analytics/dto/game-end-dto';
import { ROUNDS_PER_DAY } from '../config/tasks';
import { PlayerDailyTask } from '../entities/player-daily-task.entity';

import { DailyTaskGenerationService } from './daily-task-generation.service';
import { DailyTaskService } from './daily-task.service';
import { DailyTaskMutation, DailyTaskStore } from './daily-task.store';

const STEAM_ID = 483215844;
const TODAY = '20260816';

function createDocument(overrides: Partial<PlayerDailyTask> = {}): PlayerDailyTask {
  return {
    id: STEAM_ID.toString(),
    steamId: STEAM_ID,
    dayId: TODAY,
    completedTasks: [],
    todaySeasonPoint: 0,
    history: [],
    updatedAt: new Date('2026-08-16T00:00:00.000Z'),
    ...overrides,
  };
}

function createPlayer(overrides: Partial<GameEndPlayerDto> = {}): GameEndPlayerDto {
  return {
    steamId: STEAM_ID,
    isDisconnected: false,
    dailyTask: { dayId: TODAY, taskId: 'general_kills', star: 2, seasonPoint: 80 },
    ...overrides,
  } as GameEndPlayerDto;
}

describe('DailyTaskService', () => {
  let current: PlayerDailyTask | null;
  let written: PlayerDailyTask | undefined;
  let store: jest.Mocked<DailyTaskStore>;
  let generationService: jest.Mocked<DailyTaskGenerationService>;
  let service: DailyTaskService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-16T12:00:00.000Z'));
    current = createDocument();
    written = undefined;
    store = {
      transact: jest.fn(
        async <T>(
          _steamId: number,
          mutate: (document: PlayerDailyTask | null) => DailyTaskMutation<T>,
        ) => {
          const mutation = mutate(current);
          written = mutation.next;
          if (mutation.next) {
            current = mutation.next;
          }
          return mutation.result;
        },
      ),
    } as unknown as jest.Mocked<DailyTaskStore>;
    generationService = {
      generateCandidates: jest.fn().mockReturnValue([]),
    } as unknown as jest.Mocked<DailyTaskGenerationService>;
    service = new DailyTaskService(store, generationService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('lazily creates a new player document', async () => {
    current = null;

    const snapshot = await service.getSnapshot(STEAM_ID);

    expect(written).toMatchObject({
      id: STEAM_ID.toString(),
      steamId: STEAM_ID,
      dayId: TODAY,
      completedTasks: [],
      todaySeasonPoint: 0,
      history: [],
    });
    expect(snapshot).not.toHaveProperty('totalRounds');
    expect(snapshot).not.toHaveProperty('currentRound');
  });

  it('passes the current round and completed ids to the generator', async () => {
    current = createDocument({
      completedTasks: [{ taskId: 'general_kills', star: 1 }],
      todaySeasonPoint: 60,
    });

    await service.getSnapshot(STEAM_ID);

    expect(generationService.generateCandidates).toHaveBeenCalledWith(TODAY, STEAM_ID, 2, [
      'general_kills',
    ]);
  });

  it('short-circuits candidate generation after all rounds', async () => {
    current = createDocument({
      completedTasks: Array.from({ length: ROUNDS_PER_DAY }, (_, index) => ({
        taskId: `task_${index}`,
        star: index + 1,
      })),
    });

    const snapshot = await service.getSnapshot(STEAM_ID);

    expect(snapshot.candidates).toEqual([]);
    expect(generationService.generateCandidates).not.toHaveBeenCalled();
  });

  it('moves the previous day into history and evicts the oldest entry', async () => {
    current = createDocument({
      dayId: '20260815',
      completedTasks: [{ taskId: 'general_kills', star: 2 }],
      todaySeasonPoint: 80,
      history: Array.from({ length: 30 }, (_, index) => ({
        dayId: `202607${String(31 - index).padStart(2, '0')}`,
        tasks: [{ taskId: `old_${index}`, star: 1 }],
        seasonPoint: 60,
      })),
    });

    const snapshot = await service.getSnapshot(STEAM_ID);

    expect(snapshot.dayId).toBe(TODAY);
    expect(snapshot.completedTasks).toEqual([]);
    expect(snapshot.todaySeasonPoint).toBe(0);
    expect(snapshot.history).toHaveLength(30);
    expect(snapshot.history[0]).toEqual({
      dayId: '20260815',
      tasks: [{ taskId: 'general_kills', star: 2 }],
      seasonPoint: 80,
    });
    expect(snapshot.history[snapshot.history.length - 1]?.dayId).toBe('20260703');
  });

  it('does not add an empty previous day to history', async () => {
    current = createDocument({ dayId: '20260815', completedTasks: [], history: [] });

    const snapshot = await service.getSnapshot(STEAM_ID);

    expect(snapshot.history).toEqual([]);
  });

  it('records the client-reported star and season points', async () => {
    await service.recordGameEnd([createPlayer()]);

    expect(written?.completedTasks).toEqual([{ taskId: 'general_kills', star: 2 }]);
    expect(written?.todaySeasonPoint).toBe(80);
  });

  it('is idempotent by task id', async () => {
    current = createDocument({
      completedTasks: [{ taskId: 'general_kills', star: 1 }],
      todaySeasonPoint: 60,
    });

    await service.recordGameEnd([createPlayer()]);

    expect(written).toBeUndefined();
    expect(current.todaySeasonPoint).toBe(60);
  });

  it('rejects mismatched days and completed days', async () => {
    await service.recordGameEnd([
      createPlayer({
        dailyTask: { dayId: '20260815', taskId: 'general_kills', star: 2, seasonPoint: 80 },
      }),
    ]);
    expect(written).toBeUndefined();

    current = createDocument({
      completedTasks: Array.from({ length: ROUNDS_PER_DAY }, (_, index) => ({
        taskId: `task_${index}`,
        star: 1,
      })),
    });
    await service.recordGameEnd([
      createPlayer({ dailyTask: { dayId: TODAY, taskId: 'new', star: 1, seasonPoint: 60 } }),
    ]);
    expect(written).toBeUndefined();
  });

  it('skips disconnected players even when they report a task', async () => {
    await service.recordGameEnd([createPlayer({ isDisconnected: true })]);

    expect(store.transact).not.toHaveBeenCalled();
  });

  it('skips incomplete task objects if DTO validation is bypassed', async () => {
    await service.recordGameEnd([
      createPlayer({
        dailyTask: {
          dayId: undefined,
          taskId: 'general_kills',
          star: 2,
          seasonPoint: 80,
        },
      }),
    ]);

    expect(store.transact).not.toHaveBeenCalled();
  });

  it('omits only the player whose start snapshot fails', async () => {
    store.transact.mockRejectedValueOnce(new Error('broken document'));

    const snapshots = await service.getSnapshots([STEAM_ID, STEAM_ID + 1]);

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].steamId).toBe(STEAM_ID + 1);
  });

  it('isolates one player transaction failure from other players', async () => {
    store.transact
      .mockRejectedValueOnce(new Error('broken document'))
      .mockImplementationOnce(
        async <T>(
          _steamId: number,
          mutate: (document: PlayerDailyTask | null) => DailyTaskMutation<T>,
        ) => mutate(createDocument({ steamId: STEAM_ID + 1, id: String(STEAM_ID + 1) })).result,
      );

    await expect(
      service.recordGameEnd([
        createPlayer(),
        createPlayer({
          steamId: STEAM_ID + 1,
          dailyTask: { dayId: TODAY, taskId: 'second', star: 1, seasonPoint: 60 },
        }),
      ]),
    ).resolves.toBeUndefined();
    expect(store.transact).toHaveBeenCalledTimes(2);
  });
});
