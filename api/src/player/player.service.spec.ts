import { PlayerService } from './player.service';

describe('PlayerService', () => {
  const steamId = 123;

  function createService(player: Record<string, number | undefined> | null) {
    const playerRepository = {
      findById: jest.fn().mockResolvedValue(player ? { id: steamId.toString(), ...player } : null),
      update: jest.fn().mockImplementation((doc) => Promise.resolve(doc)),
    };
    const analyticsService = {};
    const playerConductService = {};
    const service = new PlayerService(
      playerRepository as never,
      analyticsService as never,
      playerConductService as never,
    );
    return { service, playerRepository };
  }

  describe('normalizeBattlePoints', () => {
    it.each([
      { battlePoints: Number.NaN, expected: 0 },
      { battlePoints: Number.POSITIVE_INFINITY, expected: 0 },
      { battlePoints: -1, expected: 0 },
      { battlePoints: 0, expected: 0 },
      { battlePoints: 250, expected: 250 },
      { battlePoints: 500, expected: 500 },
      { battlePoints: 580, expected: 500 },
    ])('normalizes $battlePoints to $expected', ({ battlePoints, expected }) => {
      const { service } = createService(null);

      expect(service.normalizeBattlePoints(battlePoints)).toBe(expected);
    });
  });

  describe('upsertGameEnd', () => {
    it('adds normalized battle points to the player', async () => {
      const { service, playerRepository } = createService({
        matchCount: 0,
        winCount: 0,
        disconnectCount: 0,
        seasonPointTotal: 1_000,
      });

      await service.upsertGameEnd(steamId, false, 580, false, false);

      const savedPlayer = playerRepository.update.mock.calls[0][0];
      expect(savedPlayer.seasonPointTotal).toBe(1_500);
    });
  });

  describe('addLocalSeasonPoints', () => {
    it('只增加 seasonPointTotal，不动其它字段', async () => {
      const { service, playerRepository } = createService({
        matchCount: 20,
        winCount: 5,
        seasonPointTotal: 1_000,
      });

      await service.addLocalSeasonPoints(steamId, 300);

      const savedPlayer = playerRepository.update.mock.calls[0][0];
      expect(savedPlayer.seasonPointTotal).toBe(1_300);
      expect(savedPlayer.matchCount).toBe(20);
      expect(savedPlayer.winCount).toBe(5);
    });

    it('玩家不存在时直接返回，不调用 update', async () => {
      const { service, playerRepository } = createService(null);

      await service.addLocalSeasonPoints(steamId, 300);

      expect(playerRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('setMatchCount', () => {
    it('设置 matchCount', async () => {
      const { service, playerRepository } = createService({ matchCount: 0 });

      await service.setMatchCount(steamId, 20);

      const savedPlayer = playerRepository.update.mock.calls[0][0];
      expect(savedPlayer.matchCount).toBe(20);
    });
  });

  describe('reduceUsedPoint', () => {
    it('扣减 usedSeasonPoint，不低于 0', async () => {
      const { service, playerRepository } = createService({
        seasonPointTotal: 30000,
        usedSeasonPoint: 30000,
      });

      await service.reduceUsedPoint(steamId, { usedSeasonPoint: 10000 });

      const savedPlayer = playerRepository.update.mock.calls[0][0];
      expect(savedPlayer.usedSeasonPoint).toEqual(20000);
    });

    it('扣减 usedMemberPoint，不低于 0', async () => {
      const { service, playerRepository } = createService({
        memberPointTotal: 5000,
        usedMemberPoint: 5000,
      });

      await service.reduceUsedPoint(steamId, { usedMemberPoint: 2500 });

      const savedPlayer = playerRepository.update.mock.calls[0][0];
      expect(savedPlayer.usedMemberPoint).toEqual(2500);
    });

    it('扣减额度超过已用积分时，结果钳制为 0，不会变负数', async () => {
      const { service, playerRepository } = createService({
        seasonPointTotal: 10000,
        usedSeasonPoint: 5000,
      });

      await service.reduceUsedPoint(steamId, { usedSeasonPoint: 30000 });

      const savedPlayer = playerRepository.update.mock.calls[0][0];
      expect(savedPlayer.usedSeasonPoint).toEqual(0);
    });

    it('同时扣减 usedSeasonPoint 和 usedMemberPoint', async () => {
      const { service, playerRepository } = createService({
        seasonPointTotal: 10000,
        usedSeasonPoint: 10000,
        memberPointTotal: 5000,
        usedMemberPoint: 5000,
      });

      await service.reduceUsedPoint(steamId, { usedSeasonPoint: 4000, usedMemberPoint: 1000 });

      const savedPlayer = playerRepository.update.mock.calls[0][0];
      expect(savedPlayer.usedSeasonPoint).toEqual(6000);
      expect(savedPlayer.usedMemberPoint).toEqual(4000);
    });

    it('未传 usedSeasonPoint/usedMemberPoint 时不改动对应字段', async () => {
      const { service, playerRepository } = createService({
        seasonPointTotal: 10000,
        usedSeasonPoint: 7000,
      });

      await service.reduceUsedPoint(steamId, {});

      const savedPlayer = playerRepository.update.mock.calls[0][0];
      expect(savedPlayer.usedSeasonPoint).toEqual(7000);
    });

    it('玩家不存在时直接返回，不调用 update', async () => {
      const { service, playerRepository } = createService(null);

      await service.reduceUsedPoint(steamId, { usedSeasonPoint: 1000 });

      expect(playerRepository.update).not.toHaveBeenCalled();
    });
  });
});
