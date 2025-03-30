import { Injectable, NotFoundException } from '@nestjs/common';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { CreateMemberDto } from './dto/create-member.dto';
import { MemberDto } from './dto/member.dto';
import { Member } from './entities/members.entity';

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

    return this.updateMemberExpireDate(steamId, expireDate);
  }

  async updateMemberExpireDate(steamId: number, expireDate: Date) {
    const existMember = await this.findOne(steamId);
    const member = { id: steamId.toString(), steamId, expireDate };
    if (existMember) {
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
