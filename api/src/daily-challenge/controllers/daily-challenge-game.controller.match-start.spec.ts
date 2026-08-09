import { DailyChallengeGameController } from './daily-challenge-game.controller';

describe('DailyChallengeGameController match start attribution', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('uses the server time at GAME_IN_PROGRESS instead of the earlier setup snapshot day', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-04T00:00:05.000+08:00'));
    const dailyChallenges = [{ steamId: 483215844, dayId: '2026-08-04' }];
    const playerService = {
      getSnapshots: jest.fn().mockResolvedValue(dailyChallenges),
    };
    const clock = {
      getWindow: jest.fn().mockReturnValue({ dayId: '2026-08-04' }),
    };
    const controller = new DailyChallengeGameController(
      ...([playerService, {}, clock] as unknown as ConstructorParameters<
        typeof DailyChallengeGameController
      >),
    );

    const result = await controller.matchStart([483215844]);
    const authoritativeStart = playerService.getSnapshots.mock.calls[0][1] as Date;

    expect(authoritativeStart.toISOString()).toBe('2026-08-03T16:00:05.000Z');
    expect(playerService.getSnapshots).toHaveBeenCalledWith([483215844], authoritativeStart);
    expect(clock.getWindow).toHaveBeenCalledWith(authoritativeStart);
    expect(result).toEqual({
      dayId: '2026-08-04',
      matchStartedAt: authoritativeStart.toISOString(),
      dailyChallenges,
    });
  });
});
