import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { MembersService } from '../members/members.service';
import { PlayerService } from '../player/player.service';
import { PlayerPropertyService } from '../player-property/player-property.service';

@ApiTags('Test')
@Controller('test')
export class TestController {
  constructor(
    private readonly playerService: PlayerService,
    private readonly playerPropertyService: PlayerPropertyService,
    private readonly membersService: MembersService,
  ) {}

  @Get('/init')
  async initTestData(): Promise<void> {
    await this.playerService.initialLevel();
    await this.playerPropertyService.initialProperty();
    await this.membersService.initTestData();
  }
}
