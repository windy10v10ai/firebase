import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

export class EventBaseDto {
  @ApiProperty()
  @IsNotEmpty()
  matchId: string;
  @ApiProperty({ default: 'v4.00' })
  @IsNotEmpty()
  version: string;

  @ApiProperty({ default: 0 })
  @IsNotEmpty()
  difficulty?: number;
  @ApiPropertyOptional()
  steamId?: number;
  @ApiPropertyOptional()
  isWin?: boolean;
}
