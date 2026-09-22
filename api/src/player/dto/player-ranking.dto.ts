import { ApiProperty } from '@nestjs/swagger';

export class RankedPlayerDto {
  @ApiProperty({ description: '32 位账号 ID' })
  steamId: string;
  @ApiProperty({ nullable: true, description: 'Steam 昵称，取不到时为 null' })
  personaName: string | null;
  @ApiProperty({ nullable: true, description: '64px 头像地址，取不到时为 null' })
  avatarUrl: string | null;
}

export class PlayerRankingDto {
  @ApiProperty({ description: '快照所属的 UTC 天号 YYYYMMDD' })
  date: string;
  @ApiProperty({ type: [RankedPlayerDto], description: '按累计勇士积分从高到低' })
  players: RankedPlayerDto[];
}

export class PlayerRankDto {
  @ApiProperty({
    type: Number,
    nullable: true,
    description: '按累计勇士积分的实时名次，超出可数范围时为 null',
  })
  rank: number | null;
}
