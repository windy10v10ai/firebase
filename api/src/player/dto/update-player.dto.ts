import { PartialType, PickType } from '@nestjs/swagger';

import { Player } from '../entities/player.entity';

export class UpdatePlayerDto extends PartialType(
  PickType(Player, [
    'seasonPointTotal',
    'memberPointTotal',
    'usedSeasonPoint',
    'usedMemberPoint',
  ] as const),
) {}
