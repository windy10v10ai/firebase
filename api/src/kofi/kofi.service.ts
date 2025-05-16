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
import { ActiveKofiOrderDto } from './dto/active-kofi-order.dto';

interface ShopItem {
  code: string;
  points: number;
}

const SHOP_ITEMS: Record<string, ShopItem> = {
  TIER1: {
    code: '74a1b5be84',
    points: 3500,
  },
  TIER2: {
    code: '0e9591aa5d',
    points: 11000,
  },
  TIER3: {
    code: '3d4304d9a7',
    points: 28000,
  },
};

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

    await this.kofiRepository.create(kofi);

    if (!steamId) {
      return { status: 'invalid_steam_id' };
    }

    return this.handleKofiOrder(kofi);
  }

  async activeOrderManual(dto: ActiveKofiOrderDto) {
    const steamId = await this.parseSteamId(dto.steamId.toString());
    if (!steamId) {
      logger.warn('[Kofi] Steam ID not found', { dto });
      return false;
    }

    const kofiOrders = await this.kofiRepository
      .whereEqualTo('email', dto.email)
      .whereEqualTo('success', false)
      .find();
    if (!kofiOrders) {
      logger.warn('[Kofi] Kofi order not found', { dto });
      return false;
    }

    for (const kofiOrder of kofiOrders) {
      kofiOrder.steamId = steamId;
      await this.handleKofiOrder(kofiOrder);
    }

    return true;
  }

  private async handleKofiOrder(kofi: KofiOrder) {
    if (kofi.type === KofiType.DONATION || kofi.type === KofiType.SUBSCRIPTION) {
      kofi.success = await this.handleMemberSubscription(kofi);
    } else if (kofi.type === KofiType.SHOP_ORDER) {
      kofi.success = await this.handleShopOrder(kofi);
    }

    if (kofi.success) {
      // 记录KofiUser
      await this.saveKofiUser(kofi.email, kofi.steamId);
      // 发送GA4事件
      await this.analyticsPurchaseService.kofiPurchase(kofi);
      await this.kofiRepository.update(kofi);
    }
    return { status: kofi.success ? 'success' : 'failed' };
  }

  private async handleMemberSubscription(kofi: KofiOrder): Promise<boolean> {
    if (kofi.currency !== 'USD') {
      logger.error(`[Kofi] Unsupported currency: ${kofi.currency}`);
      return false;
    }

    const month = Number((kofi.amount / 4).toFixed(1)); // 4 USD per month, 1 decimal place
    if (month <= 0) {
      logger.error(`[Kofi] Invalid month: ${month}`);
      return false;
    }

    // 检查是否是首次订阅,如果是则额外获得1000积分
    const isFirstSubscription = kofi.isFirstSubscriptionPayment;
    if (isFirstSubscription) {
      await this.playerService.upsertAddPoint(kofi.steamId, {
        memberPointTotal: 1000,
      });
    }

    // 创建会员
    await this.membersService.createMember({
      steamId: kofi.steamId,
      month,
      level: MemberLevel.PREMIUM,
    });

    return true;
  }

  private async handleShopOrder(kofi: KofiOrder): Promise<boolean> {
    if (!kofi.shopItems || kofi.shopItems.length === 0) {
      logger.error('[Kofi] No shop items found in order');
      return false;
    }

    let totalPoints = 0;

    for (const item of kofi.shopItems) {
      const quantity = item.quantity || 0;
      const shopItem = Object.values(SHOP_ITEMS).find(
        (shopItem) => shopItem.code === item.direct_link_code,
      );

      if (!shopItem) {
        logger.error(`[Kofi] Unknown shop item code: ${item.direct_link_code}`);
        return false;
      }

      totalPoints += shopItem.points * quantity;
    }

    if (totalPoints <= 0) {
      logger.error('[Kofi] Invalid total points');
      return false;
    }

    // 更新玩家积分
    await this.playerService.upsertAddPoint(kofi.steamId, {
      memberPointTotal: totalPoints,
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
