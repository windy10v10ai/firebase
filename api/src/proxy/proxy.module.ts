import { Module } from '@nestjs/common';

import { GameModule } from '../game/game.module';
import { LocalHostModule } from '../local-host/local-host.module';
import { PlayerInfoModule } from '../player-info/player-info.module';

import { ProxyController } from './proxy.controller';

@Module({
  imports: [GameModule, PlayerInfoModule, LocalHostModule],
  controllers: [ProxyController],
})
export class ProxyModule {}
