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

  describe('consumeMemberPoint', () => {
    it('spends member points through a repository transaction and records analytics once', async () => {
      const transactionPlayer = {
        id: steamId.toString(),
        memberPointTotal: 100,
        usedMemberPoint: 10,
      };
      const transactionRepository = {
        findById: jest.fn().mockResolvedValue(transactionPlayer),
        update: jest.fn().mockImplementation((player) => Promise.resolve(player)),
      };
      const playerRepository = {
        runTransaction: jest.fn((callback) => callback(transactionRepository)),
        findById: jest.fn(),
        update: jest.fn(),
      };
      const analyticsService = { playerUsePoint: jest.fn().mockResolvedValue(undefined) };
      const service = new PlayerService(
        playerRepository as never,
        analyticsService as never,
        {} as never,
      );

      const result = await service.consumeMemberPoint(steamId, 40, 'daily_challenge_refresh');

      expect(playerRepository.runTransaction).toHaveBeenCalledTimes(1);
      expect(transactionRepository.findById).toHaveBeenCalledWith(steamId.toString());
      expect(transactionRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({ usedMemberPoint: 50 }),
      );
      expect(playerRepository.findById).not.toHaveBeenCalled();
      expect(playerRepository.update).not.toHaveBeenCalled();
      expect(analyticsService.playerUsePoint).toHaveBeenCalledWith(
        steamId,
        40,
        true,
        'daily_challenge_refresh',
      );
      expect(result.usedMemberPoint).toBe(50);
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
