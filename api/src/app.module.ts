import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { initializeApp } from 'firebase-admin/app';
import { FireormModule } from 'nestjs-fireorm';

import { AdminModule } from './admin/admin.module';
import { AfdianModule } from './afdian/afdian.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CountModule } from './count/count.module';
import { EventRewardsModule } from './event-rewards/event-rewards.module';
import { GameModule } from './game/game.module';
import { MatchModule } from './match/match.module';
import { MembersModule } from './members/members.module';
import { PatreonModule } from './patreon/patreon.module';
import { PlayerModule } from './player/player.module';
import { PlayerCountModule } from './player-count/player-count.module';
import { PlayerPropertyModule } from './player-property/player-property.module';
import { TestModule } from './test/test.module';
import { AuthGuard } from './util/auth/auth.guard';
import { SecretModule } from './util/secret/secret.module';

const ENVIRONMENT = process.env.ENVIRONMENT ?? 'local';

@Module({
  imports: [
    MembersModule,
    ConfigModule.forRoot({
      envFilePath: `.env.${ENVIRONMENT}`,
      isGlobal: true,
    }),
    FireormModule.forRoot({
      firestoreSettings: {
        projectId: 'windy10v10ai',
        ignoreUndefinedProperties: true,
      },
      fireormSettings: {
        validateModels: true,
      },
    }),
    GameModule,
    AfdianModule,
    PatreonModule,
    PlayerCountModule,
    CountModule,
    PlayerModule,
    PlayerPropertyModule,
    TestModule,
    AdminModule,
    EventRewardsModule,
    MatchModule,
    AnalyticsModule,
    SecretModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {
  constructor() {
    // Initialize the firebase admin app
    initializeApp();
  }
}
