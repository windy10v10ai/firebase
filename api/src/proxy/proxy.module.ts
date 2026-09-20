import { Module } from '@nestjs/common';

import { GameModule } from '../game/game.module';
import { PlayerInfoModule } from '../player-info/player-info.module';

import { ProxyController } from './proxy.controller';

@Module({
  imports: [GameModule, PlayerInfoModule],
  controllers: [ProxyController],
})
export class ProxyModule {}
