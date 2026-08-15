import { Body, Controller, Get, ParseArrayPipe, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { ChallengeDayClockService } from '../../util/challenge-day-clock.service';
import { AcceptDailyChallengeDto } from '../dto/accept-daily-challenge.dto';
import { DailyChallengeMatchStartResponseDto } from '../dto/daily-challenge-match-start-response.dto';
import { RefreshDailyChallengeDto } from '../dto/refresh-daily-challenge.dto';
import { ViewDailyChallengeDto } from '../dto/view-daily-challenge.dto';
import { DailyChallengePlayerService } from '../services/daily-challenge-player.service';
import { DailyChallengeRefreshService } from '../services/daily-challenge-refresh.service';

@ApiTags('Daily Challenge')
@Controller('daily-challenge')
export class DailyChallengeGameController {
  constructor(
    private readonly playerService: DailyChallengePlayerService,
    private readonly refreshService: DailyChallengeRefreshService,
    private readonly clock: ChallengeDayClockService,
  ) {}

  @Get('match-start')
  async matchStart(
    @Query('steamIds', new ParseArrayPipe({ items: Number, separator: ',' })) steamIds: number[],
  ): Promise<DailyChallengeMatchStartResponseDto> {
    const matchStartedAt = new Date();
    const dailyChallenges = await this.playerService.getSnapshots(steamIds, matchStartedAt);
    return {
      dayId: this.clock.getWindow(matchStartedAt).dayId,
      matchStartedAt: matchStartedAt.toISOString(),
      dailyChallenges,
    };
  }

  @Get('snapshot')
  getSnapshot(@Query('steamId', ParseIntPipe) steamId: number) {
    return this.playerService.getSnapshot(steamId);
  }

  @Post('accept')
  accept(@Query('steamId', ParseIntPipe) steamId: number, @Body() dto: AcceptDailyChallengeDto) {
    return this.playerService.accept(steamId, dto);
  }

  @Post('refresh')
  refresh(@Query('steamId', ParseIntPipe) steamId: number, @Body() dto: RefreshDailyChallengeDto) {
    return this.refreshService.refresh(steamId, dto);
  }

  @Post('view')
  view(@Query('steamId', ParseIntPipe) steamId: number, @Body() dto: ViewDailyChallengeDto) {
    return this.playerService.markViewed(steamId, dto);
  }
}
