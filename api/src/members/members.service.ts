import { Injectable, NotFoundException } from '@nestjs/common';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { CreateMemberDto } from './dto/create-member.dto';
import { MemberDto } from './dto/member.dto';
import { Member, MemberLevel } from './entities/members.entity';

@Injectable()
export class MembersService {
  constructor(
    @InjectRepository(Member)
    private readonly membersRepository: BaseFirestoreRepository<Member>,
  ) {}

  findOne(steamId: number): Promise<Member> {
    return this.membersRepository.findById(steamId.toString());
  }

  // steamIds maxlength 10
  async findBySteamIds(steamIds: number[]): Promise<Member[]> {
    return await this.membersRepository.whereIn('steamId', steamIds).find();
  }

  async addMember(createMemberDto: CreateMemberDto) {
    const steamId = createMemberDto.steamId;
    const existMember = await this.findOne(steamId);
    const expireDate = new Date();
    if (existMember?.expireDate && existMember.expireDate.getTime() > expireDate.getTime()) {
      expireDate.setTime(existMember.expireDate.getTime());
    }
    // steam id not exist
    expireDate.setUTCDate(
      expireDate.getUTCDate() + createMemberDto.month * +process.env.DAYS_PER_MONTH,
    );
    expireDate.setUTCHours(0, 0, 0, 0);

    return this.updateMemberExpireDate(steamId, expireDate, createMemberDto.level);
  }

  async addPremiumMember(steamId: number, month: number) {
    const existMember = await this.findOne(steamId);
    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);

    let expireDate = new Date();
    expireDate.setUTCHours(0, 0, 0, 0);

    if (existMember) {
      // 如果已经是高级会员，直接增加时长
      if (existMember.level === MemberLevel.PREMIUM) {
        expireDate = new Date(existMember.expireDate);
        if (expireDate.getTime() < now.getTime()) {
          expireDate = now;
        }
      } else {
        // 如果是普通会员，将剩余时长按0.6倍折算为高级会员时长
        expireDate = now;
        if (existMember.expireDate.getTime() > now.getTime()) {
          const remainingDays = Math.ceil(
            (existMember.expireDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
          );
          expireDate.setUTCDate(expireDate.getUTCDate() + Math.floor(remainingDays * 0.6));
        }
      }
    }

    // 添加新的高级会员时长
    expireDate.setUTCDate(expireDate.getUTCDate() + month * +process.env.DAYS_PER_MONTH);

    const member = {
      id: steamId.toString(),
      steamId,
      expireDate,
      level: MemberLevel.PREMIUM,
    };

    if (existMember) {
      await this.membersRepository.update(member);
    } else {
      await this.membersRepository.create(member);
    }

    return this.find(steamId);
  }

  async updateMemberExpireDate(steamId: number, expireDate: Date, level: MemberLevel) {
    const existMember = await this.findOne(steamId);
    const member: Member = {
      id: steamId.toString(),
      steamId,
      expireDate,
      level,
    };

    if (existMember) {
      // TODO 考虑其他几种情况
      // 如果是高级会员，购买普通会员时按0.6倍折算为高级会员时长
      if (existMember.level === MemberLevel.PREMIUM) {
        const now = new Date();
        now.setUTCHours(0, 0, 0, 0);
        const remainingDays = Math.ceil(
          (expireDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        );
        const premiumExpireDate = new Date(existMember.expireDate);
        premiumExpireDate.setUTCDate(
          premiumExpireDate.getUTCDate() + Math.floor(remainingDays * 0.6),
        );
        member.expireDate = premiumExpireDate;
      }
      await this.membersRepository.update(member);
    } else {
      await this.membersRepository.create(member);
    }
    return this.find(steamId);
  }

  async find(steamId: number): Promise<MemberDto> {
    const member = await this.findOne(steamId);
    if (member) {
      return new MemberDto(member);
    } else {
      throw new NotFoundException();
    }
  }

  getDailyMemberPoint(member: Member) {
    let memberDailyPoint = 0;
    const todayZero = new Date();
    todayZero.setHours(0, 0, 0, 0);

    if (MembersService.IsMemberEnable(member)) {
      // 判断是否为当日首次登陆
      if (!member?.lastDailyDate || member.lastDailyDate < todayZero) {
        memberDailyPoint = +process.env.MEMBER_DAILY_POINT;
      }
      if (isNaN(memberDailyPoint)) {
        memberDailyPoint = 0;
      }
    }
    return memberDailyPoint;
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
