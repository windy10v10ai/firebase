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

    let success = true;
    let orderType = OrderType.others;
    // status = 2（交易成功） and product_type = 0（常规方案）and month > 0（订阅1个月以上）
    if (orderDto.status !== 2) {
      success = false;
    }
    const steamId = this.getSteamIdFromAfdianOrderDto(orderDto);
    if (!steamId) {
      success = false;
    }

    // 检测玩家是否存在
    // TODO: fix E2E测试
    // const player = await this.playerService.findBySteamId(steamId);
    // if (!player) {
    //   success = false;
    // }

    switch (orderDto.product_type) {
      case ProductType.member:
        orderType = OrderType.member;

        const month = orderDto.month;
        if (month <= 0) {
          success = false;
        }
        if (success) {
          await this.membersService.addMember({ steamId, month });
          await this.playerService.upsertAddPoint(steamId, {
            memberPointTotal: AfdianService.MEMBER_MONTHLY_POINT * month,
          });
        }
        break;

      case ProductType.goods:
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
          case PlanId.initialAttribute:
            orderType = OrderType.initialAttribute;
            planPoint = 0;
            break;
          default:
            success = false;
            break;
        }
        const goodsCount = Number(orderDto.sku_detail[0]?.count);
        if (isNaN(goodsCount) || goodsCount < 0) {
          success = false;
        }
        if (success) {
          const addPoint = planPoint * goodsCount;
          await this.playerService.upsertAddPoint(steamId, {
            memberPointTotal: addPoint,
          });
        }
        // 已废止
        // 英雄属性初始化 Initialize Attribute
        // if (orderType === OrderType.initialAttribute) {
        //   await this.playerPropertyService.deleteBySteamId(steamId);
        // }

        break;

      default:
        success = false;
        break;
    }

    const orderEntity = {
      platform: Platfrom.afdian,
      orderType,
      success,
      steamId,
      createdAt: new Date(),
      orderDto: orderDto,
      outTradeNo: orderDto.out_trade_no,
    };
    return this.orderRepository.create(orderEntity);
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
