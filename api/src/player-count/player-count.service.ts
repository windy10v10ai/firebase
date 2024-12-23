import { Injectable } from '@nestjs/common';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { PlayerRank } from './entities/player-rank.entity';

@Injectable()
export class PlayerCountService {
  constructor(
    @InjectRepository(PlayerRank)
    private readonly playerRankRepository: BaseFirestoreRepository<PlayerRank>,
  ) {}

  async getPlayerRankToday(): Promise<PlayerRank> {
    const id = this.getDateString();

    return await this.playerRankRepository.findById(id);
  }

  async updatePlayerRankToday(steamIds: string[]): Promise<PlayerRank> {
    const id = this.getDateString();
    // overwrite
    const playerRank = new PlayerRank();
    playerRank.id = id;
    playerRank.rankSteamIds = steamIds;
    return await this.playerRankRepository.create(playerRank);
  }

  private getDateString() {
    return new Date().toISOString().slice(0, 10).replace(/-/g, '');
  }
}
