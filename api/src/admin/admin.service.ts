import { Injectable } from '@nestjs/common';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { KofiOrder } from '../kofi/entities/kofi-order.entity';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(KofiOrder)
    private readonly kofiOrderRepository: BaseFirestoreRepository<KofiOrder>,
  ) {}

  async findKofiOrdersWithNullEmail() {
    // 查找所有 email 为 null 或空字符串的订单
    const allOrders = await this.kofiOrderRepository.find();
    const ordersWithNullEmail = allOrders.filter(
      (order) => !order.email || order.email.trim() === '',
    );

    // 按 fromName 分组统计
    const statsByFromName = new Map<
      string,
      {
        fromName: string;
        totalAmount: number;
        orderCount: number;
        steamIds: Set<number>;
        successCount: number;
        failedCount: number;
        orders: Array<{
          id: string;
          messageId: string;
          timestamp: Date;
          amount: number;
          currency: string;
          steamId: number;
          success: boolean;
          url: string;
        }>;
      }
    >();

    for (const order of ordersWithNullEmail) {
      const fromName = order.fromName || '(未提供)';
      if (!statsByFromName.has(fromName)) {
        statsByFromName.set(fromName, {
          fromName,
          totalAmount: 0,
          orderCount: 0,
          steamIds: new Set(),
          successCount: 0,
          failedCount: 0,
          orders: [],
        });
      }

      const stats = statsByFromName.get(fromName)!;
      stats.totalAmount += order.amount || 0;
      stats.orderCount += 1;
      if (order.steamId) {
        stats.steamIds.add(order.steamId);
      }
      if (order.success) {
        stats.successCount += 1;
      } else {
        stats.failedCount += 1;
      }
      stats.orders.push({
        id: order.id,
        messageId: order.messageId,
        timestamp: order.timestamp,
        amount: order.amount,
        currency: order.currency,
        steamId: order.steamId,
        success: order.success,
        url: order.url,
      });
    }

    // 转换为数组并排序（按订单数量倒序）
    const result = Array.from(statsByFromName.values())
      .map((stats) => ({
        fromName: stats.fromName,
        totalAmount: Number(stats.totalAmount.toFixed(2)),
        orderCount: stats.orderCount,
        steamIds: Array.from(stats.steamIds).sort((a, b) => a - b),
        steamIdCount: stats.steamIds.size,
        successCount: stats.successCount,
        failedCount: stats.failedCount,
        orders: stats.orders.sort((a, b) => {
          const timeA = a.timestamp?.getTime() || 0;
          const timeB = b.timestamp?.getTime() || 0;
          return timeB - timeA;
        }),
      }))
      .sort((a, b) => b.orderCount - a.orderCount);

    return {
      summary: {
        totalFromNames: result.length,
        totalOrders: ordersWithNullEmail.length,
      },
      statsByFromName: result,
    };
  }
}
