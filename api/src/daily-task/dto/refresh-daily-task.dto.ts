import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Matches, Min } from 'class-validator';

export class RefreshDailyTaskDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  steamId: number;

  /** Task day held by the client, taken from the /game/start response. */
  @ApiProperty()
  @IsString()
  @Matches(/^\d{8}$/)
  dayId: string;
}
