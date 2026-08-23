import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Matches, Min } from 'class-validator';

export class RefreshDailyTaskDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  steamId: number;

  /** 客户端持有的任务日 */
  @ApiProperty()
  @IsString()
  @Matches(/^\d{8}$/)
  dayId: string;
}
