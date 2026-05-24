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
      existing.kills += player.kills;
      existing.deaths += player.deaths;
      existing.assists += player.assists;
      existing.lastHits += player.lastHits;
      existing.heroDamage += player.heroDamage;
      existing.damageTaken += player.damageTaken;
      existing.healing += player.healing;
      existing.towerKills += player.towerKills;
      existing.totalGoldEarned += player.totalGoldEarned;
      existing.updatedAt = new Date();
      await this.repository.update(existing);
    } else {
      await this.repository.create({
        id,
        kills: player.kills,
        deaths: player.deaths,
        assists: player.assists,
        lastHits: player.lastHits,
        heroDamage: player.heroDamage,
        damageTaken: player.damageTaken,
        healing: player.healing,
        towerKills: player.towerKills,
        totalGoldEarned: player.totalGoldEarned,
        updatedAt: new Date(),
      });
    }
  }

  async findBySteamId(steamId: number): Promise<PlayerStatsLifetime | null> {
    return await this.repository.findById(steamId.toString());
  }
}
