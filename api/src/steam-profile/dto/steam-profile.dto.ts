import { ApiProperty } from '@nestjs/swagger';

export class SteamProfileDto {
  @ApiProperty({ description: '32 位账号 ID' })
  steamId: string;
  @ApiProperty({ nullable: true, description: 'Steam 昵称，取不到时为 null' })
  personaName: string | null;
  @ApiProperty({ nullable: true, description: '184px 头像地址，取不到时为 null' })
  avatarUrl: string | null;
}
