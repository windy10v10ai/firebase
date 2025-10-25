import { Injectable } from '@nestjs/common';
import { logger } from 'firebase-functions/v2';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { MembersService } from '../members/members.service';
import { PlayerSetting } from '../player/entities/player-setting.entity';
import { PlayerService } from '../player/player.service';

import { CreatePatreonMemberDto } from './dto/create-patreon-member.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly membersService: MembersService,
    private readonly playerService: PlayerService,
    @InjectRepository(PlayerSetting)
    private readonly playerSettingRepository: BaseFirestoreRepository<PlayerSetting>,
  ) {}
  async createPatreonMember(createPatreonMemberDto: CreatePatreonMemberDto) {
    const expireAt = this.getEndOfNextMonth();
    const result = [];
    for (const steamId of createPatreonMemberDto.steamIds) {
      // if member expiredDate > expireAt, then skip
      const existMember = await this.membersService.findOne(steamId);
      if (existMember && existMember.expireDate.getTime() >= expireAt.getTime()) {
        continue;
      }

      const player = await this.playerService.upsertAddPoint(steamId, {
        memberPointTotal: 600,
      });
      const member = await this.membersService.addPremiumMember(steamId, 1);
      result.push({
        player,
        member,
      });
    }
    return result;
  }

  async migratePlayerSettingPassiveAbilityKey2() {
    const allSettings = await this.playerSettingRepository.find();
    const migratedCount = { total: 0, updated: 0, skipped: 0 };

    for (const setting of allSettings) {
      migratedCount.total++;

      // 检查是否已经有新字段，如果有则跳过
      if (
        setting.passiveAbilityKey2 !== undefined &&
        setting.passiveAbilityQuickCast2 !== undefined
      ) {
        migratedCount.skipped++;
        continue;
      }

      // 初始化新字段
      setting.passiveAbilityKey2 = '';
      setting.passiveAbilityQuickCast2 = false;
      setting.updatedAt = new Date();

      await this.playerSettingRepository.update(setting);
      migratedCount.updated++;

      logger.info(`[AdminService] Migrated player setting for ${setting.id}`);
    }

    return {
      message: 'Player setting migration completed',
      ...migratedCount,
    };
  }

  getEndOfNextMonth() {
    const date = new Date();
    date.setMonth(date.getMonth() + 2);
    date.setUTCDate(0);
    // set start of day in utc
    date.setUTCHours(0, 0, 0, 0);
    return date;
  }
}
