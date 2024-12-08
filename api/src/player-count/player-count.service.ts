import { Injectable } from '@nestjs/common';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { UpdatePlayerCountDto } from './dto/player-count.dto';
import { PlayerCount } from './entities/player-count.entity';
import { PlayerRank } from './entities/player-rank.entity';

@Injectable()
export class PlayerCountService {
  constructor(
    @InjectRepository(PlayerCount)
    private readonly gamePlayerCountRepository: BaseFirestoreRepository<PlayerCount>,
    @InjectRepository(PlayerRank)
    private readonly playerRankRepository: BaseFirestoreRepository<PlayerRank>,
  ) {}
  async update(countDto: UpdatePlayerCountDto) {
    const id = this.getDateString();

    const gamePlayerCountExist = await this.gamePlayerCountRepository.findById(id);
    if (gamePlayerCountExist) {
      gamePlayerCountExist.addPlayerCount(countDto);
      await this.gamePlayerCountRepository.update(gamePlayerCountExist);
    } else {
      const gamePlayerCount = new PlayerCount();
      gamePlayerCount.init(id);
      gamePlayerCount.addPlayerCount(countDto);
      await this.gamePlayerCountRepository.create(gamePlayerCount);
    }

    return `This action update gamePlayerCount`;
  }
  async findAll() {
    return await this.gamePlayerCountRepository.find();
  }

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
