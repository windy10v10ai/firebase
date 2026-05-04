import { Module } from '@nestjs/common';
import { FireormModule } from 'nestjs-fireorm';

import { SecretModule } from '../util/secret/secret.module';

import { AlipayApiService } from './alipay.api.service';
import { AlipayController } from './alipay.controller';
import { AlipayService } from './alipay.service';
import { AlipayOrder } from './entities/alipay-order.entity';

@Module({
  imports: [FireormModule.forFeature([AlipayOrder]), SecretModule],
  controllers: [AlipayController],
  providers: [AlipayService, AlipayApiService],
  exports: [AlipayService, AlipayApiService],
})
export class AlipayModule {}
