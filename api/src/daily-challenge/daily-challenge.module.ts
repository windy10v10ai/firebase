import { Module } from '@nestjs/common';
import { FireormModule } from 'nestjs-fireorm';

import { DailyChallengeConfigController } from './controllers/daily-challenge-config.controller';
import { DailyChallengeGameController } from './controllers/daily-challenge-game.controller';
import {
  DailyChallengeConfigPointer,
  DailyChallengeConfigVersion,
} from './entities/daily-challenge-config.entity';
import { DailyChallengeDay } from './entities/daily-challenge-day.entity';
import { DailyChallengeGlobalContribution } from './entities/daily-challenge-global-contribution.entity';
import { DailyChallengeGlobalRanking } from './entities/daily-challenge-global-ranking.entity';
import { DailyChallengeMatchLedger } from './entities/daily-challenge-match-ledger.entity';
import { DailyChallengeOperationLedger } from './entities/daily-challenge-operation-ledger.entity';
import { DailyChallengeRewardLedger } from './entities/daily-challenge-reward-ledger.entity';
import { PlayerDailyChallenge } from './entities/player-daily-challenge.entity';
import { ChallengeDayClockService } from './services/challenge-day-clock.service';
import { DailyChallengeConfigService } from './services/daily-challenge-config.service';
import { DailyChallengeConfigStore } from './services/daily-challenge-config.store';
import { DailyChallengeDayService } from './services/daily-challenge-day.service';
import { DailyChallengeDayStore } from './services/daily-challenge-day.store';
import { DailyChallengeGenerationService } from './services/daily-challenge-generation.service';
import { DailyChallengeGlobalFreezeService } from './services/daily-challenge-global-freeze.service';
import { DailyChallengeGlobalFreezeStore } from './services/daily-challenge-global-freeze.store';
import { DailyChallengeGlobalProgressStore } from './services/daily-challenge-global-progress.store';
import { DailyChallengeGlobalRankingService } from './services/daily-challenge-global-ranking.service';
import { DailyChallengePlayerService } from './services/daily-challenge-player.service';
import { DailyChallengePlayerStore } from './services/daily-challenge-player.store';
import { DailyChallengeProgressService } from './services/daily-challenge-progress.service';
import { DailyChallengeProgressStore } from './services/daily-challenge-progress.store';
import { DailyChallengeRefreshService } from './services/daily-challenge-refresh.service';
import { DailyChallengeRewardNotificationService } from './services/daily-challenge-reward-notification.service';
import { DailyChallengeRewardService } from './services/daily-challenge-reward.service';
import { DailyChallengeRewardStore } from './services/daily-challenge-reward.store';
import { DailyChallengeSettlementService } from './services/daily-challenge-settlement.service';
import { DailyChallengeSettlementStore } from './services/daily-challenge-settlement.store';
import { DailyChallengeStreakService } from './services/daily-challenge-streak.service';
import { GlobalChallengeTargetService } from './services/global-challenge-target.service';
import { DailyChallengeConfigValidator } from './validators/daily-challenge-config.validator';

@Module({
  imports: [
    FireormModule.forFeature([
      DailyChallengeConfigPointer,
      DailyChallengeConfigVersion,
      DailyChallengeDay,
      DailyChallengeGlobalContribution,
      DailyChallengeGlobalRanking,
      DailyChallengeMatchLedger,
      DailyChallengeOperationLedger,
      DailyChallengeRewardLedger,
      PlayerDailyChallenge,
    ]),
  ],
  controllers: [DailyChallengeConfigController, DailyChallengeGameController],
  providers: [
    ChallengeDayClockService,
    DailyChallengeConfigStore,
    DailyChallengeConfigService,
    DailyChallengeConfigValidator,
    DailyChallengeDayStore,
    DailyChallengeDayService,
    DailyChallengeGenerationService,
    DailyChallengeGlobalFreezeStore,
    DailyChallengeGlobalProgressStore,
    DailyChallengeGlobalFreezeService,
    DailyChallengeGlobalRankingService,
    GlobalChallengeTargetService,
    DailyChallengePlayerStore,
    DailyChallengePlayerService,
    DailyChallengeProgressStore,
    DailyChallengeProgressService,
    DailyChallengeRefreshService,
    DailyChallengeRewardStore,
    DailyChallengeRewardService,
    DailyChallengeRewardNotificationService,
    DailyChallengeSettlementStore,
    DailyChallengeSettlementService,
    DailyChallengeStreakService,
  ],
  exports: [
    ChallengeDayClockService,
    DailyChallengeConfigStore,
    DailyChallengeConfigService,
    DailyChallengeConfigValidator,
    DailyChallengeDayStore,
    DailyChallengeDayService,
    DailyChallengeGenerationService,
    DailyChallengeGlobalFreezeStore,
    DailyChallengeGlobalProgressStore,
    DailyChallengeGlobalFreezeService,
    DailyChallengeGlobalRankingService,
    GlobalChallengeTargetService,
    DailyChallengePlayerStore,
    DailyChallengePlayerService,
    DailyChallengeProgressStore,
    DailyChallengeProgressService,
    DailyChallengeRefreshService,
    DailyChallengeRewardStore,
    DailyChallengeRewardService,
    DailyChallengeRewardNotificationService,
    DailyChallengeSettlementStore,
    DailyChallengeSettlementService,
    DailyChallengeStreakService,
  ],
})
export class DailyChallengeModule {}
