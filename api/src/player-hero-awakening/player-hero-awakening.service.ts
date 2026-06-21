import { BadRequestException, Injectable } from '@nestjs/common';
import { logger } from 'firebase-functions';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { AnalyticsService } from '../analytics/analytics.service';
import { GetHeroId } from '../analytics/data/hero-data';
import { PlayerService } from '../player/player.service';

import { PlayerHeroAwakening } from './entities/player-hero-awakening.entity';
import { HeroAwakeningItem } from './types/hero-awakening-item.types';

const HERO_AWAKENING_SEASON_POINT_COST = 10000;
const HERO_AWAKENING_MEMBER_POINT_COST = 5000;
const HERO_AWAKENING_REASON = 'hero_awakening';

@Injectable()
export class PlayerHeroAwakeningService {
  constructor(
    @InjectRepository(PlayerHeroAwakening)
    private readonly playerHeroAwakeningRepository: BaseFirestoreRepository<PlayerHeroAwakening>,
    private readonly playerService: PlayerService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  async awaken(steamId: number, heroName: string, useMemberPoint: boolean): Promise<void> {
    GetHeroId(heroName);

    const player = await this.playerService.findBySteamId(steamId);
    if (!player) {
      throw new BadRequestException();
    }

    const existing = await this.findBySteamId(steamId);
    if (existing.some((a) => a.heroName === heroName)) {
      logger.warn('[Hero Awakening] awaken error: already awakened', { steamId, heroName });
      throw new BadRequestException();
    }

    const item: HeroAwakeningItem = { heroName };

    if (useMemberPoint) {
      const cost = HERO_AWAKENING_MEMBER_POINT_COST;
      const useableMemberPoint = (player.memberPointTotal ?? 0) - (player.usedMemberPoint ?? 0);
      if (useableMemberPoint < cost) {
        throw new BadRequestException();
      }
      await this.playerService.upsertAddPoint(steamId, { usedMemberPoint: cost });
      item.usedMemberPoint = cost;
      await this.upsert(steamId, item);
      await this.analyticsService.playerUsePoint(steamId, cost, true, HERO_AWAKENING_REASON);
    } else {
      const cost = HERO_AWAKENING_SEASON_POINT_COST;
      const useableSeasonPoint = (player.seasonPointTotal ?? 0) - (player.usedSeasonPoint ?? 0);
      if (useableSeasonPoint < cost) {
        throw new BadRequestException();
      }
      await this.playerService.upsertAddPoint(steamId, { usedSeasonPoint: cost });
      item.usedSeasonPoint = cost;
      await this.upsert(steamId, item);
      await this.analyticsService.playerUsePoint(steamId, cost, false, HERO_AWAKENING_REASON);
    }
  }

  async findBySteamId(steamId: number): Promise<HeroAwakeningItem[]> {
    const doc = await this.playerHeroAwakeningRepository.findById(steamId.toString());
    return doc?.awakenings ?? [];
  }

  private async upsert(steamId: number, item: HeroAwakeningItem): Promise<PlayerHeroAwakening> {
    const id = steamId.toString();
    let doc = await this.playerHeroAwakeningRepository.findById(id);

    if (!doc) {
      doc = { id, steamId, awakenings: [] };
      await this.playerHeroAwakeningRepository.create(doc);
    }

    doc.awakenings.push(item);
    return this.playerHeroAwakeningRepository.update(doc);
  }
}
