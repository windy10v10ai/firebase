import { Injectable } from '@nestjs/common';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { Game } from './entities/game.entity';

@Injectable()
export class GamesService {
  constructor(
    @InjectRepository(Game)
    private readonly gameRepository: BaseFirestoreRepository<Game>,
  ) {}
  async recordMembersGame(
    matchId: string,
    apiKey: string,
    countryCode: string,
    steamIds: number[],
    memberPlayerCount: number,
  ) {
    let id = undefined;
    if (matchId !== undefined && matchId !== '0') {
      id = matchId;
    }
    return await this.gameRepository.create({
      id,
      matchId,
      apiKey,
      countryCode,
      playerCount: steamIds.length,
      memberPlayerCount,
      steamIds,
      createdAt: new Date(),
    });
  }

  async countgames() {
    const all = await this.gameRepository.find();
    const countAll = all.length;
    const countryCodeCN = (
      await this.gameRepository.whereEqualTo('countryCode', 'CN').find()
    ).length;
    const serverLocal = all.filter(
      (game) => game.apiKey === 'Invalid_NotOnDedicatedServer',
    ).length;
    const playerCount1 = await this.gameRepository
      .whereEqualTo('playerCount', 1)
      .find();
    const memberCount1 = playerCount1.filter(
      (game) => game.memberPlayerCount > 0,
    ).length;
    const playerCount2to5 = await this.gameRepository
      .whereGreaterOrEqualThan('playerCount', 2)
      .whereLessOrEqualThan('playerCount', 5)
      .find();
    const memberCount2to5 = playerCount2to5.filter(
      (game) => game.memberPlayerCount > 0,
    ).length;
    const playerCount6to9 = await this.gameRepository
      .whereGreaterOrEqualThan('playerCount', 6)
      .whereLessOrEqualThan('playerCount', 9)
      .find();
    const memberCount6to9 = playerCount6to9.filter(
      (game) => game.memberPlayerCount > 0,
    ).length;
    const playerCount10 = await this.gameRepository
      .whereEqualTo('playerCount', 10)
      .find();
    const memberCount10 = playerCount10.filter(
      (game) => game.memberPlayerCount > 0,
    ).length;

    const sumPlayerCount = all.reduce((acc, cur) => acc + cur.playerCount, 0);
    const sumMemberPlayerCount = all.reduce(
      (acc, game) => acc + game.memberPlayerCount,
      0,
    );
    const averagePlayerCount = sumPlayerCount / countAll;
    const localPlayerCount = all.reduce(
      (acc, game) =>
        acc +
        (game.apiKey === 'Invalid_NotOnDedicatedServer' ? game.playerCount : 0),
      0,
    );
    const localPlayerCountPercentage = localPlayerCount / sumPlayerCount;
    const playerAmount2to5 = playerCount2to5.reduce(
      (acc, cur) => acc + cur.playerCount,
      0,
    );
    const playerAmount6to9 = playerCount6to9.reduce(
      (acc, cur) => acc + cur.playerCount,
      0,
    );
    const memberAmount2to5 = playerCount2to5.reduce(
      (acc, game) => acc + game.memberPlayerCount,
      0,
    );
    const memberAmount6to9 = playerCount6to9.reduce(
      (acc, game) => acc + game.memberPlayerCount,
      0,
    );
    const memberAmount10 = playerCount10.reduce(
      (acc, game) => acc + game.memberPlayerCount,
      0,
    );

    return {
      matchCount: {
        countAll,
        countryCode: {
          CN: countryCodeCN,
          Other: countAll - countryCodeCN,
        },
        serverType: {
          local: serverLocal,
          server: countAll - serverLocal,
        },
        playerAmount: {
          p1: playerCount1.length,
          p2to5: playerCount2to5.length,
          p6to9: playerCount6to9.length,
          p10: playerCount10.length,
        },
        memberAmount: {
          p1: memberCount1,
          p2to5: memberCount2to5,
          p6to9: memberCount6to9,
          p10: memberCount10,
        },
      },
      playerCount: {
        sumPlayerCount,
        sumMemberPlayerCount,
        averagePlayerCount,
        serverType: {
          localPlayerCount,
          localPlayerCountPercentage,
        },
        playerAmount: {
          p1: playerCount1.length,
          p2to5: playerAmount2to5,
          p6to9: playerAmount6to9,
          p10: playerCount10.length * 10,
        },
        memberAmount: {
          p1: memberCount1,
          p2to5: memberAmount2to5,
          p6to9: memberAmount6to9,
          p10: memberAmount10,
        },
      },
    };
  }
}