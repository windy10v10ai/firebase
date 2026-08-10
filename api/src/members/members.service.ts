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

const CONVERSION_RATE = 0.6;
const DAYS_PER_MONTH = 31;
const NORMAL_MEMBER_MONTHLY_POINT = 300;
const PREMIUM_MEMBER_MONTHLY_POINT = 1000;
const MEMBER_DAILY_POINT = 100;
// 补签单独封顶天数，不含当日
const MAX_CATCH_UP_DAYS = 7;

export interface CheckInPoints {
  // 当日签到积分：0 或 MEMBER_DAILY_POINT
  dailyPoint: number;
  // 补签天数：0 ~ MAX_CATCH_UP_DAYS
  catchUpDays: number;
  // 补签积分：catchUpDays * MEMBER_DAILY_POINT
  catchUpPoint: number;
}

@Injectable()
export class MembersService {
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
        ? NORMAL_MEMBER_MONTHLY_POINT
        : PREMIUM_MEMBER_MONTHLY_POINT;
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
    return Math.ceil(remainingDays * CONVERSION_RATE);
  }

  async addNormalMember(steamId: number, month: number): Promise<MemberDto> {
    const existMember = await this.findOne(steamId);
    const today = this.getTodayDate();
    const additionalDays = month * DAYS_PER_MONTH;
    // 本次是否从"非会员/已过期"变为"有效会员"：是则重置连续会员周期起点
    const resetPeriodStart = !this.isMemberValid(existMember);

    // 非会员或会员已过期：增加普通会员时长
    if (resetPeriodStart) {
      return this.updateMemberExpireDate(
        existMember,
        steamId,
        today,
        additionalDays,
        MemberLevel.NORMAL,
        resetPeriodStart,
      );
    }

    // 会员有效，普通会员：增加普通会员时长
    if (existMember.level === MemberLevel.NORMAL) {
      return this.updateMemberExpireDate(
        existMember,
        steamId,
        existMember.expireDate,
        additionalDays,
        MemberLevel.NORMAL,
        resetPeriodStart,
      );
    }

    // 会员有效，高级会员：增加高级会员时长
    if (existMember.level === MemberLevel.PREMIUM) {
      const convertedDays = Math.ceil(additionalDays * CONVERSION_RATE);
      return this.updateMemberExpireDate(
        existMember,
        steamId,
        existMember.expireDate,
        convertedDays,
        MemberLevel.PREMIUM,
        resetPeriodStart,
      );
    }

    throw new InternalServerErrorException('Invalid member level');
  }

  async addPremiumMember(steamId: number, month: number): Promise<MemberDto> {
    const existMember = await this.findOne(steamId);
    const today = this.getTodayDate();
    const additionalDays = month * DAYS_PER_MONTH;
    // 本次是否从"非会员/已过期"变为"有效会员"：是则重置连续会员周期起点
    const resetPeriodStart = !this.isMemberValid(existMember);

    // 非会员或会员已过期：增加高级会员时长
    if (resetPeriodStart) {
      return this.updateMemberExpireDate(
        existMember,
        steamId,
        today,
        additionalDays,
        MemberLevel.PREMIUM,
        resetPeriodStart,
      );
    }

    // 会员有效，普通会员：剩余普通会员时长将按 0.6倍 折算为高级会员时长 + 增加高级会员时长
    if (existMember.level === MemberLevel.NORMAL) {
      const convertedDays = this.convertToPremiumDays(today, existMember.expireDate);
      return this.updateMemberExpireDate(
        existMember,
        steamId,
        today,
        convertedDays + additionalDays,
        MemberLevel.PREMIUM,
        resetPeriodStart,
      );
    }

    // 会员有效，高级会员：增加高级会员时长
    if (existMember.level === MemberLevel.PREMIUM) {
      return this.updateMemberExpireDate(
        existMember,
        steamId,
        existMember.expireDate,
        additionalDays,
        MemberLevel.PREMIUM,
        resetPeriodStart,
      );
    }

    throw new InternalServerErrorException('Invalid member level');
  }

  async updateMemberExpireDate(
    existMember: Member | null,
    steamId: number,
    baseDate: Date,
    additionalDays: number,
    level: MemberLevel,
    resetPeriodStart: boolean,
  ): Promise<MemberDto> {
    const expireDate = new Date(baseDate);
    expireDate.setUTCDate(expireDate.getUTCDate() + additionalDays);
    expireDate.setUTCHours(0, 0, 0, 0);

    if (!existMember) {
      // 全新会员：此时才 new 一个完整对象
      const member: Member = {
        id: steamId.toString(),
        steamId,
        expireDate,
        level,
        periodStartDate: baseDate,
      };
      await this.membersRepository.create(member);
      return this.findBySteamId(steamId);
    }

    // 已有会员：只更新涉及字段，lastDailyDate 等其它字段原样保留
    existMember.expireDate = expireDate;
    existMember.level = level;
    if (resetPeriodStart) {
      existMember.periodStartDate = baseDate;
    }
    await this.membersRepository.update(existMember);
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

  // 获取当日签到积分 + 补签积分。
  // 会员必须处于"有效"状态（含 1 天宽限）才会发放：完全过期后，之前漏签的天数直接作废。
  getCheckInPoints(member: Member): CheckInPoints {
    if (!MembersService.IsMemberEnable(member)) {
      return { dailyPoint: 0, catchUpDays: 0, catchUpPoint: 0 };
    }

    const today = this.getTodayDate();
    const periodStartDate = this.toDateOnly(
      member.periodStartDate ?? member.lastDailyDate ?? today,
    );

    // 本周期内还没有签到记录时，视为 periodStartDate 前一天，
    // 使"今天"成为本周期第一个可正常签到（而非补签）的日子
    const dayBeforePeriodStart = new Date(periodStartDate);
    dayBeforePeriodStart.setUTCDate(dayBeforePeriodStart.getUTCDate() - 1);

    const lastDailyDay = member.lastDailyDate ? this.toDateOnly(member.lastDailyDate) : undefined;
    const lastCreditedDay =
      lastDailyDay && lastDailyDay >= periodStartDate ? lastDailyDay : dayBeforePeriodStart;

    // 判断是否为当日首次登陆
    const dailyPoint = lastCreditedDay < today ? MEMBER_DAILY_POINT : 0;

    // 漏签天数：lastCreditedDay 与今天之间、严格排除"今天"本身的自然日天数
    const missedDays = Math.max(0, this.daysBetween(lastCreditedDay, today) - 1);
    const catchUpDays = Math.min(missedDays, MAX_CATCH_UP_DAYS);

    return {
      dailyPoint,
      catchUpDays,
      catchUpPoint: catchUpDays * MEMBER_DAILY_POINT,
    };
  }

  private toDateOnly(date: Date): Date {
    const dateOnly = new Date(date);
    dateOnly.setUTCHours(0, 0, 0, 0);
    return dateOnly;
  }

  private daysBetween(from: Date, to: Date): number {
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
  }

  static IsMemberEnable(member: Member): boolean {
    const oneDataAgo: Date = new Date();
    oneDataAgo.setDate(oneDataAgo.getDate() - 1);
    return member.expireDate > oneDataAgo;
  }

  // 登录后把 lastDailyDate 推进到今天（无论是当日签到还是补签命中）
  async updateMemberLastDailyDate(member: Member) {
    member.lastDailyDate = this.getTodayDate();
    await this.membersRepository.update(member);
  }
}
