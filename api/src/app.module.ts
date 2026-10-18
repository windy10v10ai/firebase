import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { getApps, initializeApp } from 'firebase-admin/app';
import { FireormModule } from 'nestjs-fireorm';

import { AdminModule } from './admin/admin.module';
import { AfdianModule } from './afdian/afdian.module';
import { AlipayModule } from './alipay/alipay.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { EventRewardsModule } from './event-rewards/event-rewards.module';
import { FeedbackModule } from './feedback/feedback.module';
import { GameModule } from './game/game.module';
import { KofiModule } from './kofi/kofi.module';
import { LauncherModule } from './launcher/launcher.module';
import { MembersModule } from './members/members.module';
import { PlayerModule } from './player/player.module';
import { PlayerInfoModule } from './player-info/player-info.module';
import { PlayerPropertyModule } from './player-property/player-property.module';
import { ProxyModule } from './proxy/proxy.module';
import { SteamProfileModule } from './steam-profile/steam-profile.module';
import { StripeModule } from './stripe/stripe.module';
import { AuthGuard } from './util/auth/auth.guard';
import { SecretModule } from './util/secret/secret.module';

const ENVIRONMENT = process.env.ENVIRONMENT ?? 'local';
// 数据落在哪个 Firestore project。只有 e2e 会设这个环境变量，用来把每个 jest worker 的数据分开，线上与本地都走默认值
export const FIRESTORE_PROJECT_ID = process.env.E2E_FIRESTORE_PROJECT_ID ?? 'windy10v10ai';

@Module({
  imports: [
    MembersModule,
    ConfigModule.forRoot({
      // .secret.local 不进 git，放本地联调用的第三方测试密钥，同名变量优先于 .env
      envFilePath: ['.secret.local', `.env.${ENVIRONMENT}`],
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
    StripeModule,
    KofiModule,
    PlayerModule,
    PlayerInfoModule,
    PlayerPropertyModule,
    EventRewardsModule,
    AnalyticsModule,
    AuthModule,
    SecretModule,
    SteamProfileModule,
    ProxyModule,
    LauncherModule,
    FeedbackModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: AuthGuard }],
})
export class ClientAppModule {
  constructor() {
    // 两个应用可能建在同一个进程里，不能重复初始化
    if (getApps().length === 0) {
      initializeApp();
    }
  }
}

// 管理接口只装进这个模块，公开的 client 函数用 ClientAppModule，路由表里就没有 /api/admin
@Module({
  imports: [ClientAppModule, AdminModule],
})
export class AppModule {}
