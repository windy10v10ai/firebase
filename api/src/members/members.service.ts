import { Injectable, NotFoundException } from '@nestjs/common';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { CreateMemberDto } from './dto/create-member.dto';
import { MemberDto } from './dto/member.dto';
import { MemberOld } from './entities/memberOld.entity';
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

  // TODO move to test module
  async initTestData() {
    const members: MemberOld[] = [];
    // 开发贡献者
    members.push(new MemberOld(136407523));
    members.push(new MemberOld(1194383041));
    members.push(new MemberOld(143575444));
    members.push(new MemberOld(314757913));
    members.push(new MemberOld(385130282));
    members.push(new MemberOld(967052298));
    members.push(new MemberOld(1159610111));
    // 永久会员
    members.push(new MemberOld(136668998));
    members.push(new MemberOld(128984820));
    members.push(new MemberOld(133043280));
    members.push(new MemberOld(124111398));
    members.push(new MemberOld(120921523));
    members.push(new MemberOld(146837505));
    members.push(new MemberOld(136385488));
    members.push(new MemberOld(907056028));
    // 到期
    members.push(new MemberOld(20200801, new Date('2020-08-01T00:00:00Z')));
    members.push(new MemberOld(20201231, new Date('2020-12-31T00:00:00Z')));
    // 未来
    members.push(new MemberOld(20300801, new Date('2030-08-01T00:00:00Z')));
    members.push(new MemberOld(20301231, new Date('2030-12-31T00:00:00Z')));
    for (const member of members) {
      await this.membersRepository.create({
        id: member.steamId.toString(),
        ...member,
      });
    }
    return `This action create test members with init data`;
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

  static IsMemberEnable(member: Member | MemberOld): boolean {
    const oneDataAgo: Date = new Date();
    oneDataAgo.setDate(oneDataAgo.getDate() - 1);
    return member.expireDate > oneDataAgo;
  }

  async updateMemberLastDailyDate(member: Member) {
    member.lastDailyDate = new Date();
    await this.membersRepository.update(member);
  }
}
