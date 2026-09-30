import { BigQuery } from '@google-cloud/bigquery';
import { Injectable } from '@nestjs/common';
import { logger } from 'firebase-functions/v2';

import { GameEndDto } from '../analytics/dto/game-end-dto';
import { UpdatePlayerDto } from '../player/dto/update-player.dto';
import { Player } from '../player/entities/player.entity';

import { GameEndRecordContext, buildGameEndRows } from './game-end-rows';
import { PointChangeSource, buildPointLedgerRows } from './point-ledger-rows';

const BIGQUERY_PROJECT_ID = 'windy10v10ai';
const GAME_END_PLAYERS_TABLE = 'game_end_players';
const POINT_LEDGER_TABLE = 'point_ledger';

@Injectable()
export class BigQueryService {
  private readonly datasetId = process.env.BIGQUERY_DATASET;
  private readonly client = new BigQuery({ projectId: BIGQUERY_PROJECT_ID });

  /** 把一次已接受的结算按玩家逐行写入战绩表。 */
  async recordGameEnd(gameEnd: GameEndDto, context: GameEndRecordContext): Promise<void> {
    await this.insert(GAME_END_PLAYERS_TABLE, buildGameEndRows(gameEnd, context, new Date()));
  }

  /** 把一次积分变动写入积分流水表。 */
  async recordPointChange(
    steamId: number,
    delta: UpdatePlayerDto,
    after: Player,
    source: PointChangeSource,
  ): Promise<void> {
    await this.insert(
      POINT_LEDGER_TABLE,
      buildPointLedgerRows(steamId, delta, after, source, new Date()),
    );
  }

  // 分析数据按 best-effort 写入：任何失败只记日志，不能让结算或支付跟着失败
  private async insert(tableId: string, rows: Record<string, unknown>[]): Promise<void> {
    if (process.env.NODE_ENV === 'test' || !this.datasetId || rows.length === 0) {
      return;
    }

    try {
      await this.client.dataset(this.datasetId).table(tableId).insert(rows);
    } catch (err) {
      logger.error('[BigQuery] insert failed', {
        tableId,
        rowCount: rows.length,
        error: err instanceof Error ? err.message : String(err),
        // 部分失败时 SDK 把每行的原因放在 errors 里，只有 message 看不出是哪一列不合法
        rowErrors: JSON.stringify((err as { errors?: unknown }).errors ?? []).slice(0, 2000),
      });
    }
  }
}
