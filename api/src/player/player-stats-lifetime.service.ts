import { Injectable } from '@nestjs/common';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { GameEndPlayerDto } from '../analytics/dto/game-end-dto';

import { PlayerStatsLifetime } from './entities/player-stats-lifetime.entity';

@Injectable()
export class PlayerStatsLifetimeService {
  constructor(
    @InjectRepository(PlayerStatsLifetime)
    private readonly repository: BaseFirestoreRepository<PlayerStatsLifetime>,
  ) {}

  async accumulate(steamId: number, player: GameEndPlayerDto): Promise<void> {
    const id = steamId.toString();
    const existing = await this.repository.findById(id);

    if (existing) {
      existing.kills += player.kills ?? 0;
      existing.deaths += player.deaths ?? 0;
      existing.assists += player.assists ?? 0;
      existing.lastHits += player.lastHits ?? 0;
      existing.heroDamage += player.heroDamage ?? 0;
      existing.damageTaken += player.damageTaken ?? 0;
      existing.healing += player.healing ?? 0;
      existing.towerKills += player.towerKills ?? 0;
      existing.updatedAt = new Date();
      await this.repository.update(existing);
    } else {
      await this.repository.create({
        id,
        kills: player.kills ?? 0,
        deaths: player.deaths ?? 0,
        assists: player.assists ?? 0,
        lastHits: player.lastHits ?? 0,
        heroDamage: player.heroDamage ?? 0,
        damageTaken: player.damageTaken ?? 0,
        healing: player.healing ?? 0,
        towerKills: player.towerKills ?? 0,
        updatedAt: new Date(),
      });
    }
  }

  async findBySteamId(steamId: number): Promise<PlayerStatsLifetime | null> {
    return await this.repository.findById(steamId.toString());
  }
}
