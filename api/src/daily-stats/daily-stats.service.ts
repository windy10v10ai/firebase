import { Injectable } from '@nestjs/common';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { DailyStat, DailyStatData, DailyStatId } from './daily-stat.entity';

@Injectable()
export class DailyStatsService {
  constructor(
    @InjectRepository(DailyStat)
    private readonly dailyStatRepository: BaseFirestoreRepository<DailyStat>,
  ) {}

  /** 整份覆盖一种统计的结果。 */
  async save<K extends DailyStatId>(id: K, data: DailyStatData[K]): Promise<void> {
    await this.dailyStatRepository.create({ id, data, updatedAt: new Date() });
  }

  /** 读一种统计的结果，还没生成过时返回 null。 */
  async get<K extends DailyStatId>(id: K): Promise<DailyStatData[K] | null> {
    const stat = await this.dailyStatRepository.findById(id);
    return (stat?.data as DailyStatData[K]) ?? null;
  }
}
