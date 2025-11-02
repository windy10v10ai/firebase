import { ApiProperty } from '@nestjs/swagger';

export class GA4ConfigDto {
  @ApiProperty({ description: 'Google Analytics 4 Measurement ID' })
  measurementId: string;

  @ApiProperty({ description: 'Google Analytics 4 API Secret' })
  apiSecret: string;
}
