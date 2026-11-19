import { ConflictException, ForbiddenException } from '@nestjs/common';
import { BaseFirestoreRepository } from 'fireorm';

import { PlayerService } from '../player/player.service';

import { EventReward } from './entities/event-reward.entity';
import { EventRewardsService } from './event-rewards.service';

describe('EventRewardsService web compensation', () => {
  const inWindow = new Date('2026-11-25T00:00:00Z');
  let repository: jest.Mocked<BaseFirestoreRepository<EventReward>>;
  let playerService: jest.Mocked<PlayerService>;
  let service: EventRewardsService;

  beforeEach(() => {
    repository = {
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<BaseFirestoreRepository<EventReward>>;
    playerService = { upsertAddPoint: jest.fn() } as unknown as jest.Mocked<PlayerService>;
    service = new EventRewardsService(repository, playerService);
  });

  it('没有领取记录：加 5000 勇士积分并新建记录', async () => {
    repository.findById.mockResolvedValue(null);

    await service.claimWebCompensation(1, inWindow);

    expect(playerService.upsertAddPoint).toHaveBeenCalledWith(
      1,
      { seasonPointTotal: 5000 },
      { reason: 'event_reward' },
    );
    expect(repository.create).toHaveBeenCalledWith({
      id: '1',
      steamId: 1,
      compensation20261119: true,
    });
  });

  it('已有其他活动记录：加分并在原记录上标记，不丢旧字段', async () => {
    repository.findById.mockResolvedValue({ id: '2', steamId: 2, newYear2026: true });

    await service.claimWebCompensation(2, inWindow);

    expect(playerService.upsertAddPoint).toHaveBeenCalledTimes(1);
    expect(repository.update).toHaveBeenCalledWith({
      id: '2',
      steamId: 2,
      newYear2026: true,
      compensation20261119: true,
    });
  });

  it('已领过：拒绝且不加分', async () => {
    repository.findById.mockResolvedValue({ id: '3', steamId: 3, compensation20261119: true });

    await expect(service.claimWebCompensation(3, inWindow)).rejects.toThrow(ConflictException);
    expect(playerService.upsertAddPoint).not.toHaveBeenCalled();
  });

  it.each([
    ['开始前', '2026-11-18T23:59:59Z'],
    ['结束后', '2026-12-01T00:00:00Z'],
  ])('%s：拒绝领取，状态不返回', async (_label, time) => {
    const now = new Date(time);

    await expect(service.claimWebCompensation(4, now)).rejects.toThrow(ForbiddenException);
    await expect(service.getWebCompensation(4, now)).resolves.toBeUndefined();
    expect(playerService.upsertAddPoint).not.toHaveBeenCalled();
    expect(repository.findById).not.toHaveBeenCalled();
  });

  it('领取期内：返回可领积分与是否已领', async () => {
    repository.findById.mockResolvedValueOnce(null);
    await expect(service.getWebCompensation(5, inWindow)).resolves.toEqual({
      seasonPoint: 5000,
      claimed: false,
    });

    repository.findById.mockResolvedValueOnce({ id: '5', steamId: 5, compensation20261119: true });
    await expect(service.getWebCompensation(5, inWindow)).resolves.toEqual({
      seasonPoint: 5000,
      claimed: true,
    });
  });
});
