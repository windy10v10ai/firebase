import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { ConductPlayerDto, ConductType } from './dto/conduct-player.dto';
import { PlayerConduct } from './entities/player-conduct.entity';
import { Player } from './entities/player.entity';

const CONDUCT_COOLDOWN_DAYS = 7;
const CONDUCT_POINT_DELTA = 2;
const CONDUCT_POINT_MAX = 120;
const CONDUCT_POINT_MIN = 0;

@Injectable()
export class PlayerConductService {
  constructor(
    @InjectRepository(Player)
    private readonly playerRepository: BaseFirestoreRepository<Player>,
    @InjectRepository(PlayerConduct)
    private readonly playerConductRepository: BaseFirestoreRepository<PlayerConduct>,
  ) {}

  async conduct(dto: ConductPlayerDto): Promise<Player> {
    const { fromSteamId, toSteamId, type } = dto;
    if (fromSteamId === toSteamId) {
      throw new BadRequestException('Cannot conduct yourself');
    }

    const target = await this.playerRepository.findById(toSteamId.toString());
    if (!target) {
      throw new NotFoundException(`Target player ${toSteamId} not found`);
    }

    const recordId = `${fromSteamId}_${toSteamId}`;
    const existing = await this.playerConductRepository.findById(recordId);
    const now = new Date();
    const cooldownMs = CONDUCT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
    const withinCooldown =
      existing && now.getTime() - new Date(existing.updatedAt).getTime() < cooldownMs;

    if (withinCooldown && existing.type === type) {
      // 7 天内重复相同类型：不修改，返回当前 target
      return target;
    }

    if (withinCooldown && existing.type !== type) {
      // 7 天内改变类型：撤销旧的 + 加新的
      this.revertConduct(target, existing.type);
    }
    this.applyConduct(target, type);
    target.conductPoint = this.clampConductPoint(target.conductPoint);

    if (existing) {
      existing.type = type;
      existing.updatedAt = now;
      await this.playerConductRepository.update(existing);
    } else {
      await this.playerConductRepository.create({
        id: recordId,
        fromSteamId: fromSteamId.toString(),
        toSteamId: toSteamId.toString(),
        type,
        updatedAt: now,
      });
    }

    await this.playerRepository.update(target);
    return target;
  }

  private applyConduct(player: Player, type: ConductType): void {
    if (type === ConductType.Commend) {
      player.commendCount = (player.commendCount ?? 0) + 1;
      player.conductPoint = (player.conductPoint ?? 100) + CONDUCT_POINT_DELTA;
    } else {
      player.reportCount = (player.reportCount ?? 0) + 1;
      player.conductPoint = (player.conductPoint ?? 100) - CONDUCT_POINT_DELTA;
    }
  }

  private revertConduct(player: Player, type: ConductType): void {
    if (type === ConductType.Commend) {
      player.commendCount = Math.max(0, (player.commendCount ?? 0) - 1);
      player.conductPoint = (player.conductPoint ?? 100) - CONDUCT_POINT_DELTA;
    } else {
      player.reportCount = Math.max(0, (player.reportCount ?? 0) - 1);
      player.conductPoint = (player.conductPoint ?? 100) + CONDUCT_POINT_DELTA;
    }
  }

  clampConductPoint(value: number): number {
    return Math.min(CONDUCT_POINT_MAX, Math.max(CONDUCT_POINT_MIN, value));
  }

  // 根据当前行为分和是否秒退，计算游戏结束后的行为分。
  // 秒退 -10；正常结束在 < 100 时 +1，>= 100 时不变。范围 [0, 120]。
  calculateGameEndConductPoint(current: number, isDisconnect: boolean): number {
    let next = current;
    if (isDisconnect) {
      next -= 10;
    } else if (current < 100) {
      next += 1;
    }
    return this.clampConductPoint(next);
  }
}
