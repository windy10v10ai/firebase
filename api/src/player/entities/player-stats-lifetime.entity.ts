import { ApiProperty } from '@nestjs/swagger';
import { Collection } from 'fireorm';

@Collection()
export class PlayerStatsLifetime {
  @ApiProperty()
  id: string;
  @ApiProperty()
  kills: number;
  @ApiProperty()
  deaths: number;
  @ApiProperty()
  assists: number;
  @ApiProperty()
  lastHits: number;
  @ApiProperty()
  heroDamage: number;
  @ApiProperty()
  damageTaken: number;
  @ApiProperty()
  healing: number;
  @ApiProperty()
  towerKills: number;
  @ApiProperty()
  updatedAt: Date;
}
