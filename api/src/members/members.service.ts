import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { PlayerService } from '../player/player.service';

import { CreateMemberDto } from './dto/create-member.dto';
import { MemberDto } from './dto/member.dto';
import { Member, MemberLevel } from './entities/members.entity';

@Injectable()
export class MembersService {
  private readonly CONVERSION_RATE = 0.6;
  private readonly DAYS_PER_MONTH = 31;
  private readonly NORMAL_MEMBER_MONTHLY_POINT = 300;
  private readonly PREMIUM_MEMBER_MONTHLY_POINT = 1000;
  private readonly MEMBER_DAILY_POINT = 100;

  constructor(
    @InjectRepository(Member)
    private readonly membersRepository: BaseFirestoreRepository<Member>,
    private readonly playerService: PlayerService,
  ) {}

  async createMember(createMemberDto: CreateMemberDto) {
    if (createMemberDto.month <= 0) {
      throw new BadRequestException('Month must be greater than 0');
    }
    const memberPointPerMonth =
      createMemberDto.level == MemberLevel.NORMAL
        ? this.NORMAL_MEMBER_MONTHLY_POINT
        : this.PREMIUM_MEMBER_MONTHLY_POINT;
    const player = await this.playerService.upsertAddPoint(createMemberDto.steamId, {
      memberPointTotal: memberPointPerMonth * createMemberDto.month,
    });

    const member =
      createMemberDto.level == MemberLevel.NORMAL
        ? await this.addNormalMember(createMemberDto.steamId, createMemberDto.month)
        : await this.addPremiumMember(createMemberDto.steamId, createMemberDto.month);
    return {
      player,
      member,
    };
  }

  private getTodayDate(): Date {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    return today;
  }

  private isMemberValid(member: Member): boolean {
    if (!member) {
      return false;
    }
    const today = this.getTodayDate();
    // 日期相同时，或者有效期在未来，会员有效
    return today.getTime() <= member.expireDate.getTime();
  }

  private convertToPremiumDays(fromDate: Date, toDate: Date): number {
    const remainingDays = (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24);
    if (remainingDays < 0) {
      return 0;
    }
    return Math.ceil(remainingDays * this.CONVERSION_RATE);
  }

  async addNormalMember(steamId: number, month: number): Promise<MemberDto> {
    const existMember = await this.findOne(steamId);
    const today = this.getTodayDate();
    const additionalDays = month * this.DAYS_PER_MONTH;

    // 非会员或会员已过期：增加普通会员时长
    if (!this.isMemberValid(existMember)) {
      return this.updateMemberExpireDate(steamId, today, additionalDays, MemberLevel.NORMAL);
    }

    // 会员有效，普通会员：增加普通会员时长
    if (existMember.level === MemberLevel.NORMAL) {
      return this.updateMemberExpireDate(
        steamId,
        existMember.expireDate,
        additionalDays,
        MemberLevel.NORMAL,
      );
    }

    // 会员有效，高级会员：增加高级会员时长
    if (existMember.level === MemberLevel.PREMIUM) {
      const convertedDays = Math.ceil(additionalDays * this.CONVERSION_RATE);
      return this.updateMemberExpireDate(
        steamId,
        existMember.expireDate,
        convertedDays,
        MemberLevel.PREMIUM,
      );
    }

    throw new InternalServerErrorException('Invalid member level');
  }

  async addPremiumMember(steamId: number, month: number): Promise<MemberDto> {
    const existMember = await this.findOne(steamId);
    const today = this.getTodayDate();
    const additionalDays = month * this.DAYS_PER_MONTH;

    // 非会员或会员已过期：增加高级会员时长
    if (!this.isMemberValid(existMember)) {
      return this.updateMemberExpireDate(steamId, today, additionalDays, MemberLevel.PREMIUM);
    }

    // 会员有效，普通会员：剩余普通会员时长将按 0.6倍 折算为高级会员时长 + 增加高级会员时长
    if (existMember.level === MemberLevel.NORMAL) {
      const convertedDays = this.convertToPremiumDays(today, existMember.expireDate);
      return this.updateMemberExpireDate(
        steamId,
        today,
        convertedDays + additionalDays,
        MemberLevel.PREMIUM,
      );
    }

    // 会员有效，高级会员：增加高级会员时长
    if (existMember.level === MemberLevel.PREMIUM) {
      return this.updateMemberExpireDate(
        steamId,
        existMember.expireDate,
        additionalDays,
        MemberLevel.PREMIUM,
      );
    }

    throw new InternalServerErrorException('Invalid member level');
  }

  async updateMemberExpireDate(
    steamId: number,
    baseDate: Date,
    additionalDays: number,
    level: MemberLevel,
  ): Promise<MemberDto> {
    const expireDate = new Date(baseDate);
    expireDate.setUTCDate(expireDate.getUTCDate() + additionalDays);
    expireDate.setUTCHours(0, 0, 0, 0);

    const member: Member = {
      id: steamId.toString(),
      steamId,
      expireDate,
      level,
    };

    const existMember = await this.findOne(steamId);
    if (existMember) {
      await this.membersRepository.update(member);
    } else {
      await this.membersRepository.create(member);
    }
    return this.findBySteamId(steamId);
  }

  // ---- 获取会员信息 ----
  findOne(steamId: number): Promise<Member> {
    return this.membersRepository.findById(steamId.toString());
  }

  async findBySteamIds(steamIds: number[]): Promise<Member[]> {
    return await this.membersRepository.whereIn('steamId', steamIds).find();
  }

  async findBySteamId(steamId: number): Promise<MemberDto> {
    const member = await this.findOne(steamId);
    if (member) {
      return new MemberDto(member);
    } else {
      throw new NotFoundException();
    }
  }

  getDailyMemberPoint(member: Member): number {
    const todayZero = new Date();
    todayZero.setHours(0, 0, 0, 0);

    if (MembersService.IsMemberEnable(member)) {
      // 判断是否为当日首次登陆
      if (!member?.lastDailyDate || member.lastDailyDate < todayZero) {
        return this.MEMBER_DAILY_POINT;
      }
    }
    return 0;
  }

  static IsMemberEnable(member: Member): boolean {
    const oneDataAgo: Date = new Date();
    oneDataAgo.setDate(oneDataAgo.getDate() - 1);
    return member.expireDate > oneDataAgo;
  }

  async updateMemberLastDailyDate(member: Member) {
    member.lastDailyDate = new Date();
    await this.membersRepository.update(member);
  }
}
