import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { initializeApp } from 'firebase-admin/app';
import { FireormModule } from 'nestjs-fireorm';

import { AdminModule } from './admin/admin.module';
import { AfdianModule } from './afdian/afdian.module';
import { AlipayModule } from './alipay/alipay.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { EventRewardsModule } from './event-rewards/event-rewards.module';
import { GameModule } from './game/game.module';
import { KofiModule } from './kofi/kofi.module';
import { MembersModule } from './members/members.module';
import { PlayerModule } from './player/player.module';
import { PlayerInfoModule } from './player-info/player-info.module';
import { PlayerPropertyModule } from './player-property/player-property.module';
import { ProxyModule } from './proxy/proxy.module';
import { SteamProfileModule } from './steam-profile/steam-profile.module';
import { AuthGuard } from './util/auth/auth.guard';
import { SecretModule } from './util/secret/secret.module';

const ENVIRONMENT = process.env.ENVIRONMENT ?? 'local';
// 数据落在哪个 Firestore project。线上与本地都取默认值，e2e 用它把每个 jest worker 的数据分开
export const FIRESTORE_PROJECT_ID = process.env.FIRESTORE_PROJECT_ID ?? 'windy10v10ai';

@Module({
  imports: [
    MembersModule,
    ConfigModule.forRoot({
      envFilePath: `.env.${ENVIRONMENT}`,
      isGlobal: true,
    }),
    FireormModule.forRoot({
      firestoreSettings: {
        projectId: FIRESTORE_PROJECT_ID,
        ignoreUndefinedProperties: true,
      },
      fireormSettings: {
        validateModels: false,
      },
    }),
    GameModule,
    AfdianModule,
    AlipayModule,
    KofiModule,
    PlayerModule,
    PlayerInfoModule,
    PlayerPropertyModule,
    AdminModule,
    EventRewardsModule,
    AnalyticsModule,
    AuthModule,
    SecretModule,
    SteamProfileModule,
    ProxyModule,
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
