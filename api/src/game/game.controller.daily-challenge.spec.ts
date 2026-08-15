import { SERVER_TYPE } from '../util/secret/secret.service';

import { GameController } from './game.controller';

type GameRequest = Parameters<GameController['start']>[3];
type GameEndInput = Parameters<GameController['end']>[0];

const createController = (...dependencies: unknown[]) =>
  new GameController(...(dependencies as ConstructorParameters<typeof GameController>));
const createRequest = (): GameRequest =>
  ({ headers: { 'x-api-key': 'local-key' } }) as unknown as GameRequest;
const asGameEndInput = (value: unknown): GameEndInput => value as GameEndInput;

describe('GameController daily challenge snapshot', () => {
  it('includes one current-day challenge snapshot per validated player at game start', async () => {
    const gameService = {
      validateSteamIds: jest.fn((steamIds) => steamIds),
      upsertPlayerInfo: jest.fn(),
      giveEventReward: jest.fn().mockResolvedValue([]),
      addDailyMemberPoints: jest.fn().mockResolvedValue([]),
      getGA4Config: jest.fn(),
    };
    const membersService = { findBySteamIds: jest.fn().mockResolvedValue([]) };
    const playerService = {};
    const analyticsService = { gameStart: jest.fn() };
    const secretService = {
      getServerTypeByApiKey: jest.fn().mockReturnValue(SERVER_TYPE.LOCAL),
    };
    const playerInfoService = {
      findPlayerInfoBySteamIds: jest.fn().mockResolvedValue([{ steamId: 483215844 }]),
    };
    const playerStatsLifetimeService = {};
    const dailyChallengePlayerService = {
      getSnapshots: jest.fn().mockResolvedValue([{ steamId: 483215844, dayId: '2026-08-04' }]),
    };
    const dailyChallengeSettlementService = { reconcile: jest.fn().mockResolvedValue(undefined) };
    const challengeReward = {
      steamId: 483215844,
      title: { cn: '每日挑战奖励', en: 'Daily Challenge Reward' },
      seasonPoint: 100,
      dailyChallengeReward: { dayId: '2026-08-03', source: 'personal' },
    };
    const dailyChallengeRewardNotificationService = {
      claimPointInfo: jest.fn().mockResolvedValue([challengeReward]),
    };
    const controller = createController(
      gameService,
      membersService,
      playerService,
      analyticsService,
      secretService,
      playerInfoService,
      playerStatsLifetimeService,
      dailyChallengePlayerService,
      {},
      dailyChallengeSettlementService,
      dailyChallengeRewardNotificationService,
    );

    const result = await controller.start([483215844], 123, 'test-version', createRequest());

    const matchStartedAt = dailyChallengePlayerService.getSnapshots.mock.calls[0][1];
    expect(matchStartedAt).toBeInstanceOf(Date);
    expect(dailyChallengePlayerService.getSnapshots).toHaveBeenCalledWith(
      [483215844],
      matchStartedAt,
    );
    expect(dailyChallengeSettlementService.reconcile).toHaveBeenCalledWith(matchStartedAt);
    expect(dailyChallengeRewardNotificationService.claimPointInfo).toHaveBeenCalledWith(
      [483215844],
      matchStartedAt,
    );
    expect(result.pointInfo).toEqual([challengeReward]);
    expect(result.matchStartedAt).toBe(matchStartedAt.toISOString());
    expect(result.dailyChallenges).toEqual([{ steamId: 483215844, dayId: '2026-08-04' }]);
  });

  it('keeps game start available when daily challenge snapshots fail', async () => {
    const gameService = {
      validateSteamIds: jest.fn((steamIds) => steamIds),
      upsertPlayerInfo: jest.fn(),
      giveEventReward: jest.fn().mockResolvedValue([]),
      addDailyMemberPoints: jest.fn().mockResolvedValue([]),
      getGA4Config: jest.fn(),
    };
    const membersService = { findBySteamIds: jest.fn().mockResolvedValue([]) };
    const analyticsService = { gameStart: jest.fn() };
    const secretService = {
      getServerTypeByApiKey: jest.fn().mockReturnValue(SERVER_TYPE.LOCAL),
    };
    const playerInfoService = {
      findPlayerInfoBySteamIds: jest.fn().mockResolvedValue([{ steamId: 483215844 }]),
    };
    const dailyChallengePlayerService = {
      getSnapshots: jest.fn().mockRejectedValue(new Error('daily challenge unavailable')),
    };
    const controller = createController(
      gameService,
      membersService,
      {},
      analyticsService,
      secretService,
      playerInfoService,
      {},
      dailyChallengePlayerService,
      {},
      { reconcile: jest.fn().mockResolvedValue(undefined) },
      { claimPointInfo: jest.fn().mockResolvedValue([]) },
    );

    await expect(
      controller.start([483215844], 123, 'test-version', createRequest()),
    ).resolves.toMatchObject({
      players: [{ steamId: 483215844 }],
      pointInfo: [],
    });
  });

  it('keeps game start available when catch-up settlement fails', async () => {
    const controller = createController(
      {
        validateSteamIds: jest.fn((steamIds) => steamIds),
        upsertPlayerInfo: jest.fn(),
        giveEventReward: jest.fn().mockResolvedValue([]),
        addDailyMemberPoints: jest.fn().mockResolvedValue([]),
        getGA4Config: jest.fn(),
      },
      { findBySteamIds: jest.fn().mockResolvedValue([]) },
      {},
      { gameStart: jest.fn() },
      { getServerTypeByApiKey: jest.fn().mockReturnValue(SERVER_TYPE.LOCAL) },
      { findPlayerInfoBySteamIds: jest.fn().mockResolvedValue([{ steamId: 483215844 }]) },
      {},
      { getSnapshots: jest.fn().mockResolvedValue([]) },
      {},
      { reconcile: jest.fn().mockRejectedValue(new Error('settlement unavailable')) },
      { claimPointInfo: jest.fn().mockResolvedValue([]) },
    );

    await expect(
      controller.start([483215844], 123, 'test-version', createRequest()),
    ).resolves.toMatchObject({ players: [{ steamId: 483215844 }], pointInfo: [] });
  });

  it('keeps game start available when pending reward claim fails', async () => {
    const dailyChallengePlayerService = { getSnapshots: jest.fn().mockResolvedValue([]) };
    const controller = createController(
      {
        validateSteamIds: jest.fn((steamIds) => steamIds),
        upsertPlayerInfo: jest.fn(),
        giveEventReward: jest.fn().mockResolvedValue([]),
        addDailyMemberPoints: jest.fn().mockResolvedValue([]),
        getGA4Config: jest.fn(),
      },
      { findBySteamIds: jest.fn().mockResolvedValue([]) },
      {},
      { gameStart: jest.fn() },
      { getServerTypeByApiKey: jest.fn().mockReturnValue(SERVER_TYPE.LOCAL) },
      { findPlayerInfoBySteamIds: jest.fn().mockResolvedValue([{ steamId: 483215844 }]) },
      {},
      dailyChallengePlayerService,
      {},
      { reconcile: jest.fn().mockResolvedValue(undefined) },
      { claimPointInfo: jest.fn().mockRejectedValue(new Error('claim unavailable')) },
    );

    await expect(
      controller.start([483215844], 123, 'test-version', createRequest()),
    ).resolves.toMatchObject({ players: [{ steamId: 483215844 }], pointInfo: [] });
    expect(dailyChallengePlayerService.getSnapshots).toHaveBeenCalled();
  });
});

describe('GameController daily challenge progress', () => {
  const createHarness = (
    progressImplementation?: () => Promise<unknown>,
    snapshotImplementation?: (steamIds: number[], now: Date) => Promise<unknown>,
  ) => {
    const gameService = { getOK: jest.fn().mockReturnValue('OK') };
    const playerService = { upsertGameEnd: jest.fn().mockResolvedValue(undefined) };
    const analyticsService = {
      gameEndMatch: jest.fn().mockResolvedValue(undefined),
      gameEndPlayerBot: jest.fn().mockResolvedValue(undefined),
    };
    const secretService = {
      getServerTypeByApiKey: jest.fn().mockReturnValue(SERVER_TYPE.LOCAL),
    };
    const playerStatsLifetimeService = {
      accumulate: jest.fn().mockResolvedValue(undefined),
    };
    const dailyChallengePlayerService = {
      getSnapshots: jest
        .fn()
        .mockImplementation(snapshotImplementation ?? (() => Promise.resolve([]))),
    };
    const dailyChallengeProgressService = {
      applyGameEnd: jest
        .fn()
        .mockImplementation(
          progressImplementation ?? (() => Promise.resolve({ ledgers: [], rewards: [] })),
        ),
    };
    const controller = createController(
      gameService,
      {},
      playerService,
      analyticsService,
      secretService,
      {},
      playerStatsLifetimeService,
      dailyChallengePlayerService,
      dailyChallengeProgressService,
      {},
      {},
    );
    return {
      controller,
      playerService,
      dailyChallengePlayerService,
      dailyChallengeProgressService,
    };
  };

  const createGameEnd = (withDailyChallenge = true) => ({
    matchId: 'match-1',
    version: 'test-version',
    difficulty: 1,
    winnerTeamId: 2,
    gameTimeMsec: 1000,
    gameOptions: {},
    players: [
      {
        steamId: 483215844,
        heroName: 'npc_dota_hero_lina',
        teamId: 2,
        battlePoints: 100,
        isDisconnected: true,
      },
      {
        steamId: 2,
        heroName: 'npc_dota_hero_axe',
        teamId: 3,
        battlePoints: -1,
        isDisconnected: false,
      },
      {
        steamId: 3,
        heroName: 'npc_dota_hero_crystal_maiden',
        teamId: 3,
        battlePoints: 501,
        isDisconnected: false,
      },
      {
        steamId: 0,
        heroName: 'npc_dota_hero_lina',
        teamId: 2,
        battlePoints: 100,
        isDisconnected: false,
      },
    ],
    ...(withDailyChallenge
      ? {
          dailyChallenge: {
            schemaVersion: 1,
            dataVersion: 1,
            dayId: '2026-08-04',
            matchStartedAt: '2026-08-04T01:00:00.000Z',
            players: [],
          },
        }
      : {}),
  });

  it('keeps base settlement for disconnected players but excludes them from challenge progress', async () => {
    const { controller, playerService, dailyChallengeProgressService } = createHarness();
    const gameEnd = createGameEnd();

    await controller.end(asGameEndInput(gameEnd), createRequest());

    expect(playerService.upsertGameEnd).toHaveBeenCalledTimes(1);
    expect(playerService.upsertGameEnd).toHaveBeenCalledWith(483215844, true, 100, true, true);
    expect(dailyChallengeProgressService.applyGameEnd).toHaveBeenCalledWith(
      'match-1',
      gameEnd.dailyChallenge,
      [],
      expect.any(Date),
    );
  });

  it('returns only personal rewards newly granted by this game end', async () => {
    const reward = {
      steamId: 483215844,
      source: 'personal',
      seasonPoint: 100,
      dayId: '2026-08-04',
      assignmentId: 'assignment-1',
    };
    const { controller } = createHarness(() => Promise.resolve({ ledgers: [], rewards: [reward] }));

    const result = await controller.end(asGameEndInput(createGameEnd()), createRequest());

    expect(result).toEqual({ result: 'OK', dailyChallengeRewards: [reward] });
  });

  it('returns the latest challenge snapshot even when this game grants no personal reward', async () => {
    const snapshot = { steamId: 483215844, dayId: '2026-08-04', currentRound: 2 };
    const { controller, dailyChallengePlayerService } = createHarness(undefined, () =>
      Promise.resolve([snapshot]),
    );
    const gameEnd = createGameEnd();
    gameEnd.players[0].isDisconnected = false;

    const result = await controller.end(asGameEndInput(gameEnd), createRequest());

    expect(dailyChallengePlayerService.getSnapshots).toHaveBeenCalledWith(
      [483215844],
      expect.any(Date),
    );
    expect(result).toEqual({ result: 'OK', dailyChallenges: [snapshot] });
  });

  it('returns personal rewards and latest challenge snapshots together', async () => {
    const reward = {
      steamId: 483215844,
      source: 'personal',
      seasonPoint: 120,
      dayId: '2026-08-04',
      assignmentId: 'assignment-3',
    };
    const snapshot = { steamId: 483215844, dayId: '2026-08-04', completedRoundCount: 3 };
    const { controller } = createHarness(
      () => Promise.resolve({ ledgers: [], rewards: [reward] }),
      () => Promise.resolve([snapshot]),
    );
    const gameEnd = createGameEnd();
    gameEnd.players[0].isDisconnected = false;

    await expect(controller.end(asGameEndInput(gameEnd), createRequest())).resolves.toEqual({
      result: 'OK',
      dailyChallengeRewards: [reward],
      dailyChallenges: [snapshot],
    });
  });

  it('keeps base settlement successful when the post-game challenge snapshot refresh fails', async () => {
    const { controller, playerService } = createHarness(undefined, () =>
      Promise.reject(new Error('snapshot unavailable')),
    );
    const gameEnd = createGameEnd();
    gameEnd.players[0].isDisconnected = false;

    await expect(controller.end(asGameEndInput(gameEnd), createRequest())).resolves.toEqual({
      result: 'OK',
    });
    expect(playerService.upsertGameEnd).toHaveBeenCalledTimes(1);
  });

  it('does not let challenge progress failure block the existing game end settlement', async () => {
    const { controller, playerService } = createHarness(() =>
      Promise.reject(new Error('daily challenge progress unavailable')),
    );

    await expect(controller.end(asGameEndInput(createGameEnd()), createRequest())).resolves.toEqual(
      { result: 'OK' },
    );
    expect(playerService.upsertGameEnd).toHaveBeenCalledTimes(1);
  });

  it('skips challenge progress processing when the client sends no contribution', async () => {
    const { controller, dailyChallengeProgressService } = createHarness();

    await expect(
      controller.end(asGameEndInput(createGameEnd(false)), createRequest()),
    ).resolves.toEqual({ result: 'OK' });
    expect(dailyChallengeProgressService.applyGameEnd).not.toHaveBeenCalled();
  });
});
