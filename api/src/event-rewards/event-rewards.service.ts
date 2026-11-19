import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { PlayerService } from '../player/player.service';

import { WebCompensationDto } from './dto/web-compensation.dto';
import { EventReward } from './entities/event-reward.entity';

// 网站领取的补偿独立于开局发奖的活动位，两者可以同时进行、互不覆盖
const WEB_COMPENSATION_START = new Date('2026-11-19T00:00:00.000Z');
const WEB_COMPENSATION_END = new Date('2026-11-30T23:59:59.999Z');
const WEB_COMPENSATION_SEASON_POINT = 5000;

@Injectable()
export class EventRewardsService {
  constructor(
    @InjectRepository(EventReward)
    private readonly eventRewardsRepository: BaseFirestoreRepository<EventReward>,
    private readonly playerService: PlayerService,
  ) {}

  /** 网站补偿的领取状态，领取期以外返回 undefined */
  async getWebCompensation(
    steamId: number,
    now = new Date(),
  ): Promise<WebCompensationDto | undefined> {
    if (!isWebCompensationOpen(now)) {
      return undefined;
    }
    const reward = await this.eventRewardsRepository.findById(steamId.toString());
    return {
      seasonPoint: WEB_COMPENSATION_SEASON_POINT,
      claimed: Boolean(reward?.compensation20261119),
    };
  }

  /** 在网站上领取补偿，每个账号限一次 */
  async claimWebCompensation(steamId: number, now = new Date()): Promise<void> {
    if (!isWebCompensationOpen(now)) {
      throw new ForbiddenException('compensation_closed');
    }
    const id = steamId.toString();
    const reward = await this.eventRewardsRepository.findById(id);
    if (reward?.compensation20261119) {
      throw new ConflictException('compensation_claimed');
    }

    await this.playerService.upsertAddPoint(
      steamId,
      { seasonPointTotal: WEB_COMPENSATION_SEASON_POINT },
      { reason: 'event_reward' },
    );
    if (reward) {
      reward.compensation20261119 = true;
      await this.eventRewardsRepository.update(reward);
    } else {
      await this.eventRewardsRepository.create({ id, steamId, compensation20261119: true });
    }
  }

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
        compensation20261024: true,
      });
    } else {
      // update
      // FIXME 活动每次需要更新（共 5 处，搜索「FIXME 活动」逐一改全，漏一处会重复发放或发不出）：已有记录玩家的领取字段
      eventReward.compensation20261024 = true;
      await this.eventRewardsRepository.update(eventReward);
    }
  }
}

function isWebCompensationOpen(now: Date): boolean {
  return now >= WEB_COMPENSATION_START && now <= WEB_COMPENSATION_END;
}
