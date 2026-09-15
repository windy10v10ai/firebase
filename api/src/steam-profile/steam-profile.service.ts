import { Injectable } from '@nestjs/common';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { SteamProfileDto } from './dto/steam-profile.dto';
import { SteamProfile } from './entities/steam-profile.entity';
import { SteamProfileApiService } from './steam-profile.api.service';

// 昵称头像变动不频繁，一天问一次足以，也让 Steam 的配额远远用不完
const FRESH_TTL_MS = 24 * 60 * 60 * 1000;
// 查不到的记录重试得勤一些：玩家可能刚把资料改回公开
const UNKNOWN_TTL_MS = 60 * 60 * 1000;

@Injectable()
export class SteamProfileService {
  constructor(
    @InjectRepository(SteamProfile)
    private readonly steamProfileRepository: BaseFirestoreRepository<SteamProfile>,
    private readonly steamProfileApiService: SteamProfileApiService,
  ) {}

  /** 取玩家的 Steam 昵称与头像地址，Steam 给不出结果时两个字段为 null */
  async findBySteamId(steamId: number): Promise<SteamProfileDto> {
    const id = `${steamId}`;
    const cached = await this.steamProfileRepository.findById(id);
    if (cached && !this.isExpired(cached)) {
      return this.toDto(id, cached);
    }

    const summary = await this.steamProfileApiService.fetchPlayerSummary(steamId);
    const refreshed: SteamProfile = {
      id,
      // Steam 这次没给结果时保留手上的旧昵称：显示一个可能过时的名字，好过退回纯 ID
      personaName: summary?.personaName ?? cached?.personaName,
      avatarUrl: summary?.avatarUrl ?? cached?.avatarUrl,
      fetchedAt: new Date(),
    };

    if (cached) {
      await this.steamProfileRepository.update(refreshed);
    } else {
      await this.steamProfileRepository.create(refreshed);
    }

    return this.toDto(id, refreshed);
  }

  private isExpired(profile: SteamProfile): boolean {
    const ttl = profile.personaName ? FRESH_TTL_MS : UNKNOWN_TTL_MS;
    return Date.now() - profile.fetchedAt.getTime() >= ttl;
  }

  private toDto(steamId: string, profile: SteamProfile): SteamProfileDto {
    return {
      steamId,
      personaName: profile.personaName ?? null,
      avatarUrl: profile.avatarUrl ?? null,
    };
  }
}
