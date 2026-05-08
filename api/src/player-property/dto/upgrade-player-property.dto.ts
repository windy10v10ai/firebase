import { ApiProperty } from '@nestjs/swagger';

export class UpgradePlayerPropertyDto {
  @ApiProperty()
  name: string;
  @ApiProperty()
  level: number;
}
