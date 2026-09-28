import { ApiProperty } from '@nestjs/swagger';

export class WorkshopVersionDto {
  @ApiProperty({ description: '创意工坊物品 ID' })
  id: string;
  @ApiProperty({
    description: '已发布版本的 manifest，与本机 appworkshop_570.acf 的 manifest 比对',
  })
  manifest: string;
  @ApiProperty({ description: '最近一次发布的 Unix 时间（秒）' })
  timeUpdated: number;
}
