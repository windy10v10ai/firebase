import { Injectable } from '@nestjs/common';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { MemberLevel } from '../members/entities/members.entity';
import { MembersService } from '../members/members.service';

import { KofiWebhookDto } from './dto/kofi-webhook.dto';
import { Kofi } from './entities/kofi.entity';
import { KofiType } from './enums/kofi-type.enum';

@Injectable()
export class KofiService {
  constructor(
    @InjectRepository(Kofi)
    private readonly kofiRepository: BaseFirestoreRepository<Kofi>,
    private readonly membersService: MembersService,
  ) {}

  async handleWebhook(data: KofiWebhookDto) {
    // 验证消息ID是否已处理
    const existingKofi = await this.kofiRepository
      .whereEqualTo('messageId', data.message_id)
      .findOne();

    if (existingKofi) {
      return { status: 'already_processed' };
    }

    // 从message中提取steamId
    const steamId = parseInt(data.message);
    if (isNaN(steamId)) {
      return { status: 'invalid_steam_id' };
    }

    // 创建Kofi记录
    const kofi = new Kofi();
    kofi.messageId = data.message_id;
    kofi.timestamp = new Date(data.timestamp);
    kofi.type = data.type;
    kofi.isPublic = data.is_public;
    kofi.fromName = data.from_name;
    kofi.message = data.message;
    kofi.amount = parseFloat(data.amount);
    kofi.url = data.url;
    kofi.email = data.email;
    kofi.currency = data.currency;
    kofi.isSubscriptionPayment = data.is_subscription_payment;
    kofi.isFirstSubscriptionPayment = data.is_first_subscription_payment;
    kofi.kofiTransactionId = data.kofi_transaction_id;
    kofi.shopItems = data.shop_items;
    kofi.tierName = data.tier_name;
    kofi.shipping = data.shipping;
    kofi.steamId = steamId;
    kofi.success = false;
    kofi.createdAt = new Date();
    kofi.updatedAt = new Date();

    try {
      // 处理会员订阅
      if (data.type === KofiType.DONATION || data.type === KofiType.SUBSCRIPTION) {
        const month = data.type === KofiType.SUBSCRIPTION ? 1 : Math.floor(kofi.amount / 10); // 假设10元一个月
        await this.membersService.createMember({
          steamId,
          month,
          level: MemberLevel.PREMIUM,
        });
      }

      kofi.success = true;
      await this.kofiRepository.create(kofi);
      return { status: 'success' };
    } catch (error) {
      kofi.success = false;
      await this.kofiRepository.create(kofi);
      return { status: 'error', message: error.message };
    }
  }
}
