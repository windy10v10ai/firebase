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

/** 网站用：steamId 走路由参数，guard 才会校验它属于登录的账号 */
export class RefreshDailyTaskBodyDto {
  @ApiProperty()
  @IsString()
  @Matches(/^\d{8}$/)
  dayId: string;
}
