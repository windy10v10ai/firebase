import { BigQuery } from '@google-cloud/bigquery';
import { Injectable } from '@nestjs/common';
import { logger } from 'firebase-functions/v2';

import { GameEndDto } from '../analytics/dto/game-end-dto';
import { UpdatePlayerDto } from '../player/dto/update-player.dto';
import { Player } from '../player/entities/player.entity';

import { GameEndRecordContext, buildGameEndRows } from './game-end-rows';
import { PointChangeSource, buildPointHistoryRows } from './point-history-rows';
import {
  StatsBaselineFilter,
  StatsBaselineRow,
  buildStatsBaselineQuery,
} from './stats-baseline-query';

const BIGQUERY_PROJECT_ID = 'windy10v10ai';
const BIGQUERY_LOCATION = 'asia-northeast1';
const GAME_END_PLAYERS_TABLE = 'game_end_players';
const POINT_HISTORY_TABLE = 'point_history';
// 分析写入不能拖住业务请求直到函数超时，上限要远小于函数超时
const INSERT_TIMEOUT_MS = 2000;

@Injectable()
export class BigQueryService {
  private readonly datasetId = process.env.BIGQUERY_DATASET;
  private readonly client = new BigQuery({ projectId: BIGQUERY_PROJECT_ID });

  /** 把一次已接受的结算按玩家逐行写入战绩表。 */
  async recordGameEnd(gameEnd: GameEndDto, context: GameEndRecordContext): Promise<void> {
    await this.insert(GAME_END_PLAYERS_TABLE, buildGameEndRows(gameEnd, context, new Date()));
  }

  /** 把一次积分变动写入积分记录表。 */
  async recordPointChange(
    steamId: number,
    delta: UpdatePlayerDto,
    after: Player,
    source: PointChangeSource,
  ): Promise<void> {
    await this.insert(
      POINT_HISTORY_TABLE,
      buildPointHistoryRows(steamId, delta, after, source, new Date()),
    );
  }

  /** 按难度汇总全体玩家的六边形基准；未连 BigQuery 时返回 null。 */
  async queryStatsBaseline(filter: StatsBaselineFilter): Promise<StatsBaselineRow[] | null> {
    if (!this.isEnabled()) {
      return null;
    }
    const table = `${BIGQUERY_PROJECT_ID}.${this.datasetId}.${GAME_END_PLAYERS_TABLE}`;
    const [rows] = await this.client.query({
      query: buildStatsBaselineQuery(table),
      params: filter,
      location: BIGQUERY_LOCATION,
    });
    return rows as StatsBaselineRow[];
  }

  private isEnabled(): boolean {
    return process.env.NODE_ENV !== 'test' && Boolean(this.datasetId);
  }

  // 分析数据按 best-effort 写入：任何失败只记日志，不能让结算或支付跟着失败
  private async insert(tableId: string, rows: Record<string, unknown>[]): Promise<void> {
    if (!this.isEnabled() || rows.length === 0) {
      return;
    }

    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`timed out after ${INSERT_TIMEOUT_MS} ms`)),
        INSERT_TIMEOUT_MS,
      );
    });
    try {
      await Promise.race([
        this.client.dataset(this.datasetId).table(tableId).insert(rows),
        timeout,
      ]);
    } catch (err) {
      logger.error('[BigQuery] insert failed', {
        tableId,
        rowCount: rows.length,
        error: err instanceof Error ? err.message : String(err),
        // 部分失败时 SDK 把每行的原因放在 errors 里，只有 message 看不出是哪一列不合法
        rowErrors: JSON.stringify((err as { errors?: unknown }).errors ?? []).slice(0, 2000),
      });
    } finally {
      clearTimeout(timer);
    }
  }
}
