import { Injectable } from '@nestjs/common';
import { logger } from 'firebase-functions/v2';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { AnalyticsPurchaseService } from '../analytics/analytics.purchase.service';
import { MemberLevel } from '../members/entities/members.entity';
import { MembersService } from '../members/members.service';
import { PlayerService } from '../player/player.service';

import { KofiWebhookDto } from './dto/kofi-webhook.dto';
import { KofiOrder } from './entities/kofi-order.entity';
import { KofiUser } from './entities/kofi-user.entity';
import { KofiType } from './enums/kofi-type.enum';

@Injectable()
export class KofiService {
  constructor(
    @InjectRepository(KofiOrder)
    private readonly kofiRepository: BaseFirestoreRepository<KofiOrder>,
    @InjectRepository(KofiUser)
    private readonly kofiUserRepository: BaseFirestoreRepository<KofiUser>,
    private readonly membersService: MembersService,
    private readonly playerService: PlayerService,
    private readonly analyticsPurchaseService: AnalyticsPurchaseService,
  ) {}

  async handleWebhook(data: KofiWebhookDto) {
    // 验证消息ID是否已处理
    const existingKofi = await this.kofiRepository
      .whereEqualTo('messageId', data.message_id)
      .findOne();

    if (existingKofi) {
      return { status: 'already_processed' };
    }

    // 从message中提取steamId，如果失败则尝试从KofiUser中获取
    const steamId = await this.getSteamId(data.email, data.message, data.from_name);

    // 创建Kofi记录
    const kofi = new KofiOrder();
    kofi.id = data.message_id;
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

    if (!steamId) {
      await this.kofiRepository.create(kofi);
      return { status: 'invalid_steam_id' };
    }

    // 处理会员订阅
    if (data.type === KofiType.DONATION || data.type === KofiType.SUBSCRIPTION) {
      kofi.success = await this.handleMemberSubscription(data, steamId);
    } else {
      kofi.success = false;
    }

    if (kofi.success) {
      // 记录KofiUser
      await this.saveKofiUser(data.email, steamId);
      // 发送GA4事件
      await this.analyticsPurchaseService.kofiPurchase(kofi);
    }
    await this.kofiRepository.create(kofi);
    return { status: kofi.success ? 'success' : 'failed' };
  }

  private async handleMemberSubscription(data: KofiWebhookDto, steamId: number): Promise<boolean> {
    if (data.currency !== 'USD') {
      logger.error(`[Kofi] Unsupported currency: ${data.currency}`);
      return false;
    }

    const amount = parseFloat(data.amount);
    const month = Number((amount / 4).toFixed(1)); // 4 USD per month, 1 decimal place
    if (month <= 0) {
      logger.error(`[Kofi] Invalid month: ${month}`);
      return false;
    }

    // 检查是否是首次订阅,如果是则额外获得1000积分
    const isFirstSubscription = data.is_first_subscription_payment;
    if (isFirstSubscription) {
      await this.playerService.upsertAddPoint(steamId, {
        memberPointTotal: 1000,
      });
    }

    // 创建会员
    await this.membersService.createMember({
      steamId,
      month,
      level: MemberLevel.PREMIUM,
    });

    return true;
  }

  private async getSteamId(email: string, message: string, fromName: string): Promise<number> {
    // 尝试从message中获取steamId
    let steamId = await this.parseSteamId(message);
    if (!steamId) {
      // 如果message中没有，尝试从name中获取
      steamId = await this.parseSteamId(fromName);
    }
    if (!steamId) {
      // 如果name中也没有，尝试从KofiUser中获取
      steamId = await this.getSteamIdFromKofiUser(email);
    }
    return steamId;
  }

  private async parseSteamId(input: string): Promise<number> {
    const steamId = parseInt(input);
    if (isNaN(steamId)) {
      return null;
    }

    const player = await this.playerService.findBySteamId(steamId);
    if (!player) {
      return null;
    }
    return steamId;
  }

  private async getSteamIdFromKofiUser(email: string): Promise<number> {
    const kofiUser = await this.kofiUserRepository.whereEqualTo('email', email).findOne();

    return kofiUser?.steamId || null;
  }

  private async saveKofiUser(email: string, steamId: number): Promise<void> {
    const existingUser = await this.kofiUserRepository.whereEqualTo('email', email).findOne();

    if (existingUser) {
      existingUser.steamId = steamId;
      existingUser.updatedAt = new Date();
      await this.kofiUserRepository.update(existingUser);
    } else {
      const kofiUser = new KofiUser();
      kofiUser.id = email;
      kofiUser.email = email;
      kofiUser.steamId = steamId;
      kofiUser.createdAt = new Date();
      kofiUser.updatedAt = new Date();
      await this.kofiUserRepository.create(kofiUser);
    }
  }
}
