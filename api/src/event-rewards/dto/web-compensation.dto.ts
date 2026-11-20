import { ApiProperty } from '@nestjs/swagger';

export class WebCompensationDto {
  @ApiProperty()
  seasonPoint: number;
  @ApiProperty()
  claimed: boolean;
}
