import { Injectable } from '@nestjs/common';
import { logger } from 'firebase-functions/v2';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { AnalyticsPurchaseService } from '../analytics/analytics.purchase.service';
import { MemberLevel } from '../members/entities/members.entity';
import { MembersService } from '../members/members.service';
import { PlayerService } from '../player/player.service';
import { PlayerPropertyService } from '../player-property/player-property.service';

import { AfdianApiService } from './afdian.api.service';
import { OrderDto } from './dto/afdian-webhook.dto';
import { AfdianOrder } from './entities/afdian-order.entity';
import { AfdianUser } from './entities/afdian-user.entity';
import { OrderType } from './enums/order-type.enum';

enum ProductType {
  member = 0,
  goods = 1,
}

enum PlanId {
  memberNormal = '6e27c8103bd011ed887852540025c377',
  memberPremium = '6c206f360d4c11f0a2cb52540025c377',
  tire1 = '6f73a48e546011eda08052540025c377',
  tire2 = '29df1632688911ed9e7052540025c377',
  tire3 = '0783fa70688a11edacd452540025c377',
  initialAttribute = '7bda7efc6e7111edb5b652540025c377',
}

enum PlanPoint {
  tire1 = 3500,
  tire2 = 11000,
  tire3 = 28000,
}

@Injectable()
export class AfdianService {
  private readonly OUT_TRADE_NO_BASE = '202410010000000000000000000';
  constructor(
    private readonly afdianApiService: AfdianApiService,
    @InjectRepository(AfdianOrder)
    private readonly afdianOrderRepository: BaseFirestoreRepository<AfdianOrder>,
    @InjectRepository(AfdianUser)
    private readonly afdianUserRepository: BaseFirestoreRepository<AfdianUser>,
    private readonly membersService: MembersService,
    private readonly playerService: PlayerService,
    private readonly analyticsPurchaseService: AnalyticsPurchaseService,

    private readonly playerPropertyService: PlayerPropertyService,
  ) {}

  /** 手动激活订单
   * @param outTradeNo - 订单号
   * @param steamId - Steam ID
   * @returns 成功: `true`，失败: `false`
   *
   * @remarks
   * - 如果是2024年10月1日之前的订单号，需要人工处理。
   * - 如果订单已存在且标记为成功，则函数返回true。
   * - 如果订单存在但未成功，则尝试激活订单并更新存储库。
   * - 如果订单成功激活，则保存用户记录并发送购买事件。
   * - 如果订单不存在，则从Afdian API获取订单详情并尝试激活为新订单。
   */
  async activeOrderManual(outTradeNo: string, steamId: number) {
    if (outTradeNo < this.OUT_TRADE_NO_BASE) {
      // 旧订单需人工处理
      logger.warn('旧订单需人工处理', { outTradeNo, steamId });
      return false;
    }
    // 检查steamId是否存在
    const player = await this.playerService.findBySteamId(steamId);
    if (!player) {
      logger.warn(`steamId ${steamId} 不存在`);
      return false;
    }
    const existOrder = await this.afdianOrderRepository
      .whereEqualTo('outTradeNo', outTradeNo)
      .findOne();
    if (existOrder) {
      if (existOrder.success) {
        return true;
      }
      const orderDto = existOrder.orderDto;
      const orderType = this.getOrderType(orderDto);
      const isActiveSuccess = await this.activeAfidianOrder(orderDto, orderType, steamId);

      existOrder.success = isActiveSuccess;
      existOrder.steamId = steamId;
      await this.afdianOrderRepository.update(existOrder);

      if (isActiveSuccess) {
        // 保存玩家记录
        await this.saveAfdianUser(orderDto.user_id, steamId);
        // 发送事件
        await this.analyticsPurchaseService.afdianPurchase(existOrder);
      }

      return isActiveSuccess;
    }

    const orderDto = await this.afdianApiService.fetchAfdianOrderByOutTradeNo(outTradeNo);
    if (!orderDto) {
      return false;
    }
    return this.activeNewOrder(orderDto, steamId);
  }

  /** 通过Webhook激活订单
   * @param orderDto - 订单详情
   * @returns 成功: `true`，失败: `false`
   */
  async activeWebhookOrder(orderDto: OrderDto): Promise<boolean> {
    // 检测重复订单
    const existOrder = await this.afdianOrderRepository
      .whereEqualTo('outTradeNo', orderDto.out_trade_no)
      .findOne();
    if (existOrder) {
      return true;
    }

    const steamId = await this.getSteamId(orderDto);

    return await this.activeNewOrder(orderDto, steamId);
  }

  /** 激活最近的订单
   * @param orderNumber 检测的最近订单件数
   * @returns 检测的订单号范围，激活的订单号
   *
   * @remarks
   * - 获取最近的订单
   * - 检查重复订单
   * - 激活订单
   */
  async activeRecentOrder(orderNumber: number) {
    const orders = await this.afdianApiService.fetchAfdianOrders(1, orderNumber);
    const activeTradeNos: string[] = [];

    for (const orderDto of orders) {
      const existOrder = await this.afdianOrderRepository
        .whereEqualTo('outTradeNo', orderDto.out_trade_no)
        .findOne();
      if (existOrder) {
        continue;
      }

      const steamId = await this.getSteamId(orderDto);
      const isActiveSuccess = await this.activeNewOrder(orderDto, steamId);
      if (isActiveSuccess) {
        activeTradeNos.push(orderDto.out_trade_no);
      }
    }

    return {
      checkTradeNos: orders.map((order) => order.out_trade_no),
      activeTradeNos,
    };
  }

  /**
   * 激活新订单，基于提供的订单详情和Steam ID。
   * - 调用前，需要确保订单号不重复。
   * - 无论订单是否成功，都会保存订单记录。
   */
  async activeNewOrder(orderDto: OrderDto, steamId: number): Promise<boolean> {
    const orderType = this.getOrderType(orderDto);

    const isActiveSuccess = await this.activeAfidianOrder(orderDto, orderType, steamId);

    // 保存订单记录（包括失败订单）
    const afdianOrder = await this.saveAfdianOrder(orderDto, orderType, steamId, isActiveSuccess);

    if (isActiveSuccess) {
      // 保存爱发电用户记录
      await this.saveAfdianUser(orderDto.user_id, steamId);
      // 发送GA4事件
      await this.analyticsPurchaseService.afdianPurchase(afdianOrder);
    }

    return isActiveSuccess;
  }

  async findFailed() {
    const orders = await this.afdianOrderRepository.whereEqualTo('success', false).find();

    orders.sort((a, b) => {
      return b.outTradeNo.localeCompare(a.outTradeNo);
    });
    return orders.filter((order) => {
      return order.outTradeNo > this.OUT_TRADE_NO_BASE;
    });
  }

  // --- private ---
  private getOrderType(orderDto: OrderDto): OrderType {
    if (ProductType.member == orderDto.product_type) {
      switch (orderDto.plan_id) {
        case PlanId.memberNormal:
          return OrderType.memberNormal;
        case PlanId.memberPremium:
          return OrderType.memberPremium;
        default:
          return OrderType.others;
      }
    }

    if (ProductType.goods == orderDto.product_type) {
      switch (orderDto.plan_id) {
        case PlanId.tire1:
          return OrderType.goods1;
        case PlanId.tire2:
          return OrderType.goods2;
        case PlanId.tire3:
          return OrderType.goods3;
        case PlanId.initialAttribute:
          return OrderType.initialAttribute;
        default:
          return OrderType.others;
      }
    }

    return OrderType.others;
  }

  private async activeAfidianOrder(
    orderDto: OrderDto,
    orderType: OrderType,
    steamId: number,
  ): Promise<boolean> {
    if (!steamId) {
      return false;
    }
    // status = 2（交易成功）
    if (orderDto.status !== 2) {
      return false;
    }
    if (orderType === OrderType.others) {
      return false;
    }

    // 订阅普通会员
    if (orderType === OrderType.memberNormal) {
      const month = orderDto.month;
      if (month <= 0) {
        return false;
      }
      await this.membersService.createMember({
        steamId,
        month,
        level: MemberLevel.NORMAL,
      });
      return true;
    }

    // 订阅高级会员
    if (orderType === OrderType.memberPremium) {
      const month = orderDto.month;
      if (month <= 0) {
        return false;
      }
      await this.membersService.createMember({
        steamId,
        month,
        level: MemberLevel.PREMIUM,
      });
      return true;
    }

    // 购买积分
    let planPoint = 0;
    if (orderType === OrderType.goods1) {
      planPoint = PlanPoint.tire1;
    } else if (orderType === OrderType.goods2) {
      planPoint = PlanPoint.tire2;
    } else if (orderType === OrderType.goods3) {
      planPoint = PlanPoint.tire3;
    } else if (orderType === OrderType.initialAttribute) {
      // 初始属性
      await this.playerPropertyService.deleteBySteamId(steamId);
      return true;
    } else {
      return false;
    }

    const goodsCount = Number(orderDto.sku_detail[0]?.count);
    if (isNaN(goodsCount) || goodsCount < 0) {
      return false;
    }

    // 更新玩家积分
    const addPoint = planPoint * goodsCount;
    await this.playerService.upsertAddPoint(steamId, {
      memberPointTotal: addPoint,
    });
    return true;
  }

  async saveAfdianOrder(
    orderDto: OrderDto,
    orderType: OrderType,
    steamId: number,
    success: boolean,
  ) {
    const orderEntity = {
      orderType,
      success,
      userId: orderDto.user_id,
      steamId,
      createdAt: new Date(),
      orderDto: orderDto,
      outTradeNo: orderDto.out_trade_no,
    };
    return await this.afdianOrderRepository.create(orderEntity);
  }

  private async saveAfdianUser(userId: string, steamId: number) {
    const existAfdianUser = await this.afdianUserRepository.findById(userId);
    if (existAfdianUser) {
      if (existAfdianUser.steamId !== steamId) {
        existAfdianUser.steamId = steamId;
        await this.afdianUserRepository.update(existAfdianUser);
      }
      return existAfdianUser;
    }

    const afdianUser = {
      id: userId,
      userId,
      steamId,
    };
    return await this.afdianUserRepository.create(afdianUser);
  }

  private async getSteamId(orderDto: OrderDto): Promise<number> {
    const steamId = await this.getSteamIdFromAfdianOrderDto(orderDto);

    if (!steamId) {
      const afdianUser = await this.afdianUserRepository.findById(orderDto.user_id);
      if (afdianUser) {
        return afdianUser.steamId;
      }
    }

    return steamId;
  }

  private async getSteamIdFromAfdianOrderDto(orderDto: OrderDto): Promise<number | null> {
    // 查找remark
    const rawString = orderDto.remark;
    if (!rawString) {
      return null;
    }
    const steamId_remark = Number(rawString);
    if (isNaN(steamId_remark)) {
      return null;
    }

    // 检查玩家是否存在
    const player = await this.playerService.findBySteamId(steamId_remark);
    if (!player) {
      return null;
    }

    return steamId_remark;
  }
}
