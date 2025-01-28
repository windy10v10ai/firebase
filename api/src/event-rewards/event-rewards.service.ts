import { Injectable } from '@nestjs/common';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { EventReward } from './entities/event-reward.entity';

@Injectable()
export class EventRewardsService {
  constructor(
    @InjectRepository(EventReward)
    private readonly eventRewardsRepository: BaseFirestoreRepository<EventReward>,
  ) {}

  async getRewardResults(steamIds: number[]): Promise<
    {
      steamId: number;
      result: boolean;
    }[]
  > {
    const ids = steamIds.map((id) => id.toString());
    const eventRewards = await this.eventRewardsRepository.whereIn('id', ids).find();

    return steamIds.map((steamId) => ({
      steamId,
      // FIXME 活动每次需要更新
      result: eventRewards.find((r) => r.steamId === steamId)?.lunarNewYear2025 ?? false,
    }));
  }

  async setReward(steamId: number): Promise<void> {
    const id = steamId.toString();
    const eventReward = await this.eventRewardsRepository.findById(id);
    if (!eventReward) {
      // create
      await this.eventRewardsRepository.create({
        id,
        steamId,
        // FIXME 活动每次需要更新
        lunarNewYear2025: true,
      });
    } else {
      // update
      // FIXME 活动每次需要更新
      eventReward.lunarNewYear2025 = true;
      await this.eventRewardsRepository.update(eventReward);
    }
  }
}
