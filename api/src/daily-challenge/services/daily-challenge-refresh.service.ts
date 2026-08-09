import { Injectable } from '@nestjs/common';

import { RefreshDailyChallengeDto } from '../dto/refresh-daily-challenge.dto';
import {
  DailyChallengeActionResult,
  PlayerDailyChallenge,
} from '../entities/player-daily-challenge.entity';

import { ChallengeDayClockService } from './challenge-day-clock.service';
import { dailyChallengeConflict } from './daily-challenge-action.error';
import { DailyChallengeConfigService } from './daily-challenge-config.service';
import { DailyChallengeGenerationService } from './daily-challenge-generation.service';
import { resolvePersonalChallengeConfig } from './daily-challenge-personal-config';
import { DailyChallengePlayerService } from './daily-challenge-player.service';
import { DailyChallengePlayerStore } from './daily-challenge-player.store';

@Injectable()
export class DailyChallengeRefreshService {
  constructor(
    private readonly store: DailyChallengePlayerStore,
    private readonly configService: DailyChallengeConfigService,
    private readonly generationService: DailyChallengeGenerationService,
    private readonly clockService: ChallengeDayClockService,
    private readonly playerService: DailyChallengePlayerService,
  ) {}

  async refresh(
    steamId: number,
    dto: RefreshDailyChallengeDto,
    now: Date = new Date(),
  ): Promise<DailyChallengeActionResult> {
    const window = this.clockService.getWindow(now);
    if (window.dayId !== dto.dayId) {
      throw dailyChallengeConflict('day_closed', '该挑战日已经结束');
    }
    await this.playerService.getSnapshot(steamId, now);
    const stateId = `${dto.dayId}_${steamId}`;
    const currentState = await this.store.getState(stateId);
    if (!currentState) {
      throw dailyChallengeConflict('day_closed', '今日挑战状态不存在');
    }
    const configVersion = await this.configService.getVersion(currentState.configVersionId);
    if (!configVersion) {
      throw dailyChallengeConflict('day_closed', '今日挑战配置不可用');
    }
    const operationId = `refresh:${dto.dayId}:${steamId}:${dto.requestId}`;
    const operation = await this.store.runOperation(operationId, stateId, steamId, (context) => {
      if (!context.state) {
        throw dailyChallengeConflict('day_closed', '今日挑战状态不存在');
      }
      if (
        context.state.completedAt ||
        context.state.completedRoundCount >= context.state.totalRounds
      ) {
        throw dailyChallengeConflict('day_closed', '今日个人挑战已全部完成');
      }
      if (context.state.acceptedTask) {
        throw dailyChallengeConflict('already_selected', '选择任务后不能刷新');
      }
      if (!this.isMemberActive(context.member, now)) {
        throw dailyChallengeConflict('not_member', '只有会员可以刷新每日挑战');
      }

      const isFree = !context.state.freeRefreshUsed;
      if (
        !isFree &&
        context.state.paidRefreshesUsed >= context.state.refreshCostsMemberPoint.length
      ) {
        throw dailyChallengeConflict('refresh_limit_reached', '今日刷新次数已用完');
      }
      const cost = isFree
        ? 0
        : context.state.refreshCostsMemberPoint[context.state.paidRefreshesUsed];
      const availableMemberPoint = context.player.memberPointTotal - context.player.usedMemberPoint;
      if (availableMemberPoint < cost) {
        throw dailyChallengeConflict('insufficient_member_points', '会员积分不足');
      }

      const personalConfig = resolvePersonalChallengeConfig(configVersion.snapshot);
      const refreshIndex = context.state.refreshIndex + 1;
      const tasks = this.generationService.generatePlayerCandidates({
        dayId: dto.dayId,
        steamId,
        currentRound: context.state.currentRound,
        refreshIndex,
        configVersion: context.state.configVersion,
        tasks: configVersion.snapshot.tasks,
        seenTaskIds: context.state.seenTaskIds,
        personalStarWeights: personalConfig.starWeights,
      });
      const candidates = this.playerService.createTaskSnapshots(
        tasks,
        dto.dayId,
        steamId,
        context.state.currentRound,
        context.state.totalRounds,
        refreshIndex,
        context.state.configVersion,
        personalConfig,
      );
      const nextState: PlayerDailyChallenge = {
        ...context.state,
        candidates,
        seenTaskIds: [
          ...new Set([
            ...context.state.seenTaskIds,
            ...candidates.map((candidate) => candidate.taskId),
          ]),
        ],
        refreshIndex,
        freeRefreshUsed: true,
        paidRefreshesUsed: context.state.paidRefreshesUsed + (isFree ? 0 : 1),
        updatedAt: now,
      };
      const player = {
        ...context.player,
        usedMemberPoint: context.player.usedMemberPoint + cost,
      };
      const result: DailyChallengeActionResult = {
        code: 'refreshed',
        snapshot: this.playerService.buildSnapshot(nextState, { ...context, player }, now),
        costMemberPoint: cost,
        memberPointBalance: Math.max(0, player.memberPointTotal - player.usedMemberPoint),
      };
      return {
        state: nextState,
        player,
        operation: {
          type: 'refresh',
          steamId,
          dayId: dto.dayId,
          requestId: dto.requestId,
          result,
          createdAt: now,
        },
      };
    });
    return { ...operation.result, snapshot: await this.playerService.getSnapshot(steamId, now) };
  }

  private isMemberActive(member: { expireDate: Date } | null, now: Date): boolean {
    if (!member) {
      return false;
    }
    const oneDayAgo = new Date(now);
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    return member.expireDate > oneDayAgo;
  }
}
