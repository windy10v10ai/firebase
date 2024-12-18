import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { CountService } from './count.service';

@ApiTags('Count')
@Controller('count')
export class CountController {
  constructor(private readonly countService: CountService) {}

  @Get('hero/:version/:heroType')
  findHeroRate(
    @Param('version') version: string,
    @Param('heroType') heroType: string,
    @Query('order') order: string,
  ) {
    return this.countService.findHeroRate(version, heroType, order);
  }

  @Get('hero/chart/:version/:heroType')
  findHeroRateChart(
    @Param('version') version: string,
    @Param('heroType') heroType: string,
    @Query('order') order: string,
  ) {
    return this.countService.findHeroRateChart(version, heroType, order);
  }
}
