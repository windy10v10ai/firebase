import { ApiProperty } from '@nestjs/swagger';
import { Collection } from 'fireorm';

import { ConductType } from '../dto/conduct-player.dto';

@Collection()
export class PlayerConduct {
  // doc id = "{fromSteamId}_{toSteamId}"
  @ApiProperty()
  id: string;
  @ApiProperty()
  fromSteamId: string;
  @ApiProperty()
  toSteamId: string;
  @ApiProperty({ enum: ConductType })
  type: ConductType;
  @ApiProperty()
  updatedAt: Date;
}
