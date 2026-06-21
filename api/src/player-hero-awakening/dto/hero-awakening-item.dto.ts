import { ApiProperty } from '@nestjs/swagger';

export class HeroAwakeningItemDto {
  @ApiProperty()
  heroName: string;
}
