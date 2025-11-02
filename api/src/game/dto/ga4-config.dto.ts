import { ApiProperty } from '@nestjs/swagger';

import { SERVER_TYPE } from '../../util/secret/secret.service';

export class GA4ConfigDto {
  @ApiProperty({ description: 'Google Analytics 4 Measurement ID' })
  measurementId: string;

  @ApiProperty({ description: 'Google Analytics 4 API Secret' })
  apiSecret: string;

  @ApiProperty({ enum: SERVER_TYPE, description: 'Server type' })
  serverType: SERVER_TYPE;
}
