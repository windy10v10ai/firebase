import { ApiProperty, OmitType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsOptional, ValidateNested } from 'class-validator';

import { EventBaseDto } from './event-base-dto';

export class ItemBuildDto {
  @ApiProperty()
  @IsNotEmpty()
  steamId: number;

  @ApiProperty({ default: 'item_slot1_name', required: false })
  @IsOptional()
  slot1?: string;

  @ApiProperty({ default: 'item_slot2_name', required: false })
  @IsOptional()
  slot2?: string;

  @ApiProperty({ default: 'item_slot3_name', required: false })
  @IsOptional()
  slot3?: string;

  @ApiProperty({ default: 'item_slot4_name', required: false })
  @IsOptional()
  slot4?: string;

  @ApiProperty({ default: 'item_slot5_name', required: false })
  @IsOptional()
  slot5?: string;

  @ApiProperty({ default: 'item_slot6_name', required: false })
  @IsOptional()
  slot6?: string;

  @ApiProperty({ default: 'neutral_active_item_name', required: false })
  @IsOptional()
  neutralActiveSlot?: string;

  @ApiProperty({ default: 'neutral_passive_item_name', required: false })
  @IsOptional()
  neutralPassiveSlot?: string;
}

export class ItemListDto extends OmitType(EventBaseDto, ['steamId']) {
  @ApiProperty({ type: [ItemBuildDto] })
  @ValidateNested({ each: true })
  @Type(() => ItemBuildDto)
  items: ItemBuildDto[];
}
