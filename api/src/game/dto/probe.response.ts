import { ApiPropertyOptional } from '@nestjs/swagger';

export class ProbeResponse {
  @ApiPropertyOptional({ description: 'ISO 3166-1 alpha-2 country code of the request origin' })
  country?: string;
}
