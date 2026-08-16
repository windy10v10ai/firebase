import { Injectable } from '@nestjs/common';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { PlayerDailyTask } from '../entities/player-daily-task.entity';

export interface DailyTaskMutation<T> {
  result: T;
  next?: PlayerDailyTask;
}

@Injectable()
export class DailyTaskStore {
  constructor(
    @InjectRepository(PlayerDailyTask)
    private readonly repository: BaseFirestoreRepository<PlayerDailyTask>,
  ) {}

  async transact<T>(
    steamId: number,
    mutate: (current: PlayerDailyTask | null) => DailyTaskMutation<T>,
  ): Promise<T> {
    const id = steamId.toString();
    return this.repository.runTransaction(async (transaction) => {
      const current = await transaction.findById(id);
      const mutation = mutate(current);
      if (!mutation.next) {
        return mutation.result;
      }

      if (current) {
        await transaction.update(mutation.next);
      } else {
        await transaction.create(mutation.next);
      }
      return mutation.result;
    });
  }
}
