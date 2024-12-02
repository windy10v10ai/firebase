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
      result: eventRewards.find((r) => r.steamId === steamId)?.fourthAnniversary ?? false,
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
        fourthAnniversary: true,
      });
    } else {
      // update
      eventReward.fourthAnniversary = true;
      await this.eventRewardsRepository.update(eventReward);
    }
  }
}
