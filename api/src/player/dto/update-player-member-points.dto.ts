import { OmitType, PartialType } from '@nestjs/swagger';

import { Player } from '../entities/player.entity';

export class CreatePlayerDto extends PartialType(OmitType(Player, ['id'] as const)) {}
