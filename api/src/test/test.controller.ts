import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { PlayerService } from '../player/player.service';
import { PlayerPropertyService } from '../player-property/player-property.service';

@ApiTags('Test')
@Controller('test')
export class TestController {
  constructor(
    private readonly playerService: PlayerService,
    private readonly playerPropertyService: PlayerPropertyService,
  ) {}

  @Get('/init')
  async initTestData(): Promise<void> {
    await this.initialLevel();
    await this.playerPropertyService.initialProperty();
  }

  private async initialLevel() {
    const memberLevelList = [{ steamId: 136407523, level: 32 }];
    for (const memberLevel of memberLevelList) {
      const memberPointsNeed = this.playerService.getMemberTotalPoint(memberLevel.level);

      await this.playerService.upsertAddPoint(memberLevel.steamId, {
        memberPointTotal: memberPointsNeed,
      });
    }
  }
}
