import { ApiProperty } from '@nestjs/swagger';

import { PlayerPropertyItemDto } from './player-property-item.dto';

// upgrade/upsert 需要知道操作的是哪个玩家，返回体不需要——PlayerPropertyItemDto 保持精简
export class PlayerPropertyInput extends PlayerPropertyItemDto {
  @ApiProperty()
  steamId: number;
}
