import { BadRequestException, Injectable } from '@nestjs/common';
import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { AnalyticsService } from '../analytics/analytics.service';
import { GetHeroId } from '../analytics/data/hero-data';
import { PlayerService } from '../player/player.service';

import { PlayerHeroAwakening } from './entities/player-hero-awakening.entity';
import { HeroAwakeningItem } from './types/hero-awakening-item.types';

const HERO_AWAKENING_SEASON_POINT_COST = 10000;
const HERO_AWAKENING_SEASON_POINT_COST_RANDOM = 5000;
const HERO_AWAKENING_MEMBER_POINT_COST = 5000;
const HERO_AWAKENING_MEMBER_POINT_COST_RANDOM = 2500;
const HERO_AWAKENING_REASON = 'hero_awakening';
const HERO_AWAKENING_REASON_RANDOM = 'hero_awakening_random';

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
      logger.warn('[Hero Awakening] awaken no-op: already awakened', { steamId, heroName });
      return;
    }

    const doc = await this.findOrCreateDoc(steamId);
    const isRandomHit = doc.randomCandidates?.candidates.includes(heroName) ?? false;

    const item: HeroAwakeningItem = { heroName };
    const reason = isRandomHit ? HERO_AWAKENING_REASON_RANDOM : HERO_AWAKENING_REASON;

    const cost = this.resolveCost(useMemberPoint, isRandomHit);
    if (useMemberPoint) {
      const useableMemberPoint = (player.memberPointTotal ?? 0) - (player.usedMemberPoint ?? 0);
      if (useableMemberPoint < cost) {
        throw new BadRequestException();
      }
      await this.playerService.upsertAddPoint(steamId, { usedMemberPoint: cost });
      item.usedMemberPoint = cost;
    } else {
      const useableSeasonPoint = (player.seasonPointTotal ?? 0) - (player.usedSeasonPoint ?? 0);
      if (useableSeasonPoint < cost) {
        throw new BadRequestException();
      }
      await this.playerService.upsertAddPoint(steamId, { usedSeasonPoint: cost });
      item.usedSeasonPoint = cost;
    }
    await this.saveAwakening(doc, item, isRandomHit);
    await this.analyticsService.playerUsePoint(steamId, cost, useMemberPoint, reason);
  }

  private resolveCost(useMemberPoint: boolean, isRandomHit: boolean): number {
    if (useMemberPoint) {
      return isRandomHit
        ? HERO_AWAKENING_MEMBER_POINT_COST_RANDOM
        : HERO_AWAKENING_MEMBER_POINT_COST;
    }
    return isRandomHit ? HERO_AWAKENING_SEASON_POINT_COST_RANDOM : HERO_AWAKENING_SEASON_POINT_COST;
  }

  async ensureRandomCandidates(steamId: number, candidates: string[]): Promise<string[]> {
    const player = await this.playerService.findBySteamId(steamId);
    if (!player) {
      throw new BadRequestException();
    }

    const doc = await this.findOrCreateDoc(steamId);

    if (doc.randomCandidates) {
      return doc.randomCandidates.candidates;
    }

    candidates.forEach((heroName) => GetHeroId(heroName));
    if (candidates.some((heroName) => doc.awakenings.some((a) => a.heroName === heroName))) {
      throw new BadRequestException();
    }

    doc.randomCandidates = { candidates, createdAt: new Date() };
    await this.playerHeroAwakeningRepository.update(doc);
    return candidates;
  }

  async findBySteamId(steamId: number): Promise<HeroAwakeningItem[]> {
    const doc = await this.playerHeroAwakeningRepository.findById(steamId.toString());
    return doc?.awakenings ?? [];
  }

  private async findOrCreateDoc(steamId: number): Promise<PlayerHeroAwakening> {
    const id = steamId.toString();
    const doc = await this.playerHeroAwakeningRepository.findById(id);
    if (doc) {
      return doc;
    }
    const created: PlayerHeroAwakening = { id, steamId, awakenings: [] };
    return this.playerHeroAwakeningRepository.create(created);
  }

  private async saveAwakening(
    doc: PlayerHeroAwakening,
    item: HeroAwakeningItem,
    clearRandomCandidates: boolean,
  ): Promise<PlayerHeroAwakening> {
    doc.awakenings.push(item);
    if (clearRandomCandidates) {
      doc.randomCandidates = FieldValue.delete() as unknown as undefined;
    }
    return this.playerHeroAwakeningRepository.update(doc);
  }
}
