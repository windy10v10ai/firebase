import { Injectable } from '@nestjs/common';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { MembersService } from '../members/members.service';
import { Order } from '../orders/entities/order.entity';
import { OrderType } from '../orders/enums/order-type.enum';
import { Platfrom } from '../orders/enums/platfrom.enum';
import { PlayerService } from '../player/player.service';

import { OrderDto } from './dto/afdian-webhook.dto';

enum ProductType {
  member = 0,
  goods = 1,
}

enum PlanId {
  tire1 = '6f73a48e546011eda08052540025c377',
  tire2 = '29df1632688911ed9e7052540025c377',
  tire3 = '0783fa70688a11edacd452540025c377',
  initialAttribute = '7bda7efc6e7111edb5b652540025c377',
}

enum PlanPoint {
  tire1 = 3200,
  tire2 = 10000,
  tire3 = 26000,
}

@Injectable()
export class AfdianService {
  private static MEMBER_MONTHLY_POINT = 300;
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: BaseFirestoreRepository<Order>,
    private readonly membersService: MembersService,
    private readonly playerService: PlayerService,
  ) {}

  async processAfdianOrder(orderDto: OrderDto) {
    // 检测重复订单
    const existOrder = await this.orderRepository
      .whereEqualTo('outTradeNo', orderDto.out_trade_no)
      .findOne();
    if (existOrder) {
      return existOrder;
    }

    const steamId = this.getSteamIdFromAfdianOrderDto(orderDto);

    // 检测玩家是否存在
    // TODO: fix E2E测试
    // const player = await this.playerService.findBySteamId(steamId);
    // if (!player) {
    //   success = false;
    // }
    const activeResult = await this.activeAfidianOrder(orderDto, steamId);

    return await this.saveAfdianOrder(
      orderDto,
      activeResult.orderType,
      steamId,
      activeResult.success,
    );
  }

  private async activeAfidianOrder(
    orderDto: OrderDto,
    steamId: number,
  ): Promise<{
    success: boolean;
    orderType: OrderType;
  }> {
    if (!steamId) {
      return { success: false, orderType: OrderType.others };
    }
    // status = 2（交易成功）
    if (orderDto.status !== 2) {
      return { success: false, orderType: OrderType.others };
    }

    if (ProductType.member == orderDto.product_type) {
      const month = orderDto.month;
      if (month <= 0) {
        return { success: false, orderType: OrderType.member };
      }

      // 更新会员
      await this.membersService.addMember({ steamId, month });
      await this.playerService.upsertAddPoint(steamId, {
        memberPointTotal: AfdianService.MEMBER_MONTHLY_POINT * month,
      });
      return { success: true, orderType: OrderType.member };
    }

    if (ProductType.goods == orderDto.product_type) {
      let orderType = OrderType.others;
      let planPoint = 0;
      switch (orderDto.plan_id) {
        case PlanId.tire1:
          orderType = OrderType.goods1;
          planPoint = PlanPoint.tire1;
          break;
        case PlanId.tire2:
          orderType = OrderType.goods2;
          planPoint = PlanPoint.tire2;
          break;
        case PlanId.tire3:
          orderType = OrderType.goods3;
          planPoint = PlanPoint.tire3;
          break;
        default:
          break;
      }

      if (orderType === OrderType.others) {
        return { success: false, orderType };
      }

      const goodsCount = Number(orderDto.sku_detail[0]?.count);
      if (isNaN(goodsCount) || goodsCount < 0) {
        return { success: false, orderType };
      }

      // 更新玩家积分
      const addPoint = planPoint * goodsCount;
      await this.playerService.upsertAddPoint(steamId, {
        memberPointTotal: addPoint,
      });
      return { success: true, orderType };
    }

    return { success: false, orderType: OrderType.others };
  }

  private async saveAfdianOrder(
    orderDto: OrderDto,
    orderType: OrderType,
    steamId: number,
    success: boolean,
  ) {
    const orderEntity = {
      platform: Platfrom.afdian,
      orderType,
      success,
      steamId,
      createdAt: new Date(),
      orderDto: orderDto,
      outTradeNo: orderDto.out_trade_no,
    };
    return await this.orderRepository.create(orderEntity);
  }

  private getSteamIdFromAfdianOrderDto(orderDto: OrderDto): number | null {
    // 查找remark
    const rawString = orderDto.remark;
    if (!rawString) {
      return null;
    }
    const steamId_remark = Number(rawString);
    if (isNaN(steamId_remark)) {
      return null;
    }
    return steamId_remark;
  }
}
