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
      result: EventReward | undefined;
    }[]
  > {
    const ids = steamIds.map((id) => id.toString());
    const eventRewards = await this.eventRewardsRepository.whereIn('id', ids).find();

    return steamIds.map((steamId) => ({
      steamId,
      result: eventRewards.find((r) => r.steamId === steamId),
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
        // FIXME 活动每次需要更新（共 5 处，搜索「FIXME 活动」逐一改全，漏一处会重复发放或发不出）：新玩家的领取字段
        midAutumn2026: true,
      });
    } else {
      // update
      // FIXME 活动每次需要更新（共 5 处，搜索「FIXME 活动」逐一改全，漏一处会重复发放或发不出）：已有记录玩家的领取字段
      eventReward.midAutumn2026 = true;
      await this.eventRewardsRepository.update(eventReward);
    }
  }
}
