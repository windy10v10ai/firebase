import { ApiProperty } from '@nestjs/swagger';

export class CheckInPointsDto {
  // 当日签到发放的积分，0 表示今天已经签过
  @ApiProperty()
  dailyPoint: number;
  @ApiProperty()
  catchUpDays: number;
  @ApiProperty()
  catchUpPoint: number;
}
