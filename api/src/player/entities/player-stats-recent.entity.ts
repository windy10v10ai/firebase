import { ApiProperty } from '@nestjs/swagger';
import { Collection } from 'fireorm';

export class PlayerStatsRecentMatch {
  @ApiProperty()
  matchId: string;
  @ApiProperty()
  endedAt: Date;
  @ApiProperty()
  version: string;
  @ApiProperty()
  difficulty: number;
  @ApiProperty()
  durationSec: number;
  @ApiProperty()
  win: boolean;
  @ApiProperty()
  multiplierRadiant: number;
  @ApiProperty()
  multiplierDire: number;
  @ApiProperty()
  towerPowerPct: number;

  @ApiProperty()
  heroName: string;
  @ApiProperty()
  level: number;
  /** 0 = 未觉醒，1 = 已觉醒；与上报的语义一致，不可断言只有 0/1 */
  @ApiProperty()
  awaken: number;
  @ApiProperty()
  isDisconnected: boolean;

  @ApiProperty()
  kills: number;
  @ApiProperty()
  deaths: number;
  @ApiProperty()
  assists: number;
  @ApiProperty()
  lastHits: number;
  @ApiProperty()
  totalGoldEarned: number;
  @ApiProperty()
  heroDamage: number;
  @ApiProperty()
  damageTaken: number;
  @ApiProperty()
  healing: number;
  @ApiProperty()
  towerKills: number;
  @ApiProperty()
  stuns: number;
  @ApiProperty()
  roshanKills: number;
  @ApiProperty()
  battlePoints: number;

  // 以下由客户端下一版起发送，旧客户端的场次没有这些字段
  @ApiProperty({ required: false })
  strength?: number;
  @ApiProperty({ required: false })
  agility?: number;
  @ApiProperty({ required: false })
  intellect?: number;
  @ApiProperty({ required: false, type: [String] })
  items?: string[];
  @ApiProperty({ required: false })
  neutralItem?: string;
  @ApiProperty({ required: false })
  neutralPassiveItem?: string;
  @ApiProperty({ required: false, type: [String] })
  abilities?: string[];
}

@Collection()
export class PlayerStatsRecent {
  @ApiProperty()
  id: string;
  /** 新场次在前，超出上限的从尾部丢弃 */
  @ApiProperty({ type: [PlayerStatsRecentMatch] })
  matches: PlayerStatsRecentMatch[];
  @ApiProperty()
  updatedAt: Date;
}
