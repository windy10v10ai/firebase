import { BigQuery } from '@google-cloud/bigquery';
import { Injectable } from '@nestjs/common';
import { logger } from 'firebase-functions/v2';

import { GameEndDto } from '../analytics/dto/game-end-dto';
import { JoinPath } from '../launcher/dto/launcher-room.dto';
import { LauncherRoomJoin } from '../launcher/entities/launcher-room-join.entity';
import { LauncherRoom } from '../launcher/entities/launcher-room.entity';
import { CreateMemberDto } from '../members/dto/create-member.dto';
import { MemberDto } from '../members/dto/member.dto';
import { Member } from '../members/entities/members.entity';
import { UpdatePlayerDto } from '../player/dto/update-player.dto';
import { Player } from '../player/entities/player.entity';

import { GameEndRecordContext, buildGameEndRows } from './game-end-rows';
import {
  ConnectionQualityRecord,
  RouteCheckRecord,
  buildConnectionQualityRow,
  buildJoinResultRow,
  buildRoomCreatedRow,
  buildRouteCheckRow,
} from './launcher-room-rows';
import { buildMemberHistoryRow } from './member-history-rows';
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
const MEMBER_HISTORY_TABLE = 'member_history';
const LAUNCHER_ROOM_EVENTS_TABLE = 'launcher_room_events';
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

  /** 把一次开通或续费会员写入会员记录表。 */
  async recordMemberChange(
    purchase: CreateMemberDto,
    before: Member | undefined,
    after: MemberDto,
    source: PointChangeSource,
  ): Promise<void> {
    await this.insert(MEMBER_HISTORY_TABLE, [
      buildMemberHistoryRow(purchase, before, after, source, new Date()),
    ]);
  }

  /** 记录一次启动器开房。 */
  async recordRoomCreated(
    room: LauncherRoom,
    launcherVersion: string,
    country: string | undefined,
  ): Promise<void> {
    await this.insert(LAUNCHER_ROOM_EVENTS_TABLE, [
      buildRoomCreatedRow(room, launcherVersion, country, new Date()),
    ]);
  }

  /** 记录一次启动器加入的连接结果。 */
  async recordJoinResult(
    room: LauncherRoom,
    join: LauncherRoomJoin,
    path: JoinPath | undefined,
    elapsedMs: number,
    relayAddress: string | undefined,
  ): Promise<void> {
    await this.insert(LAUNCHER_ROOM_EVENTS_TABLE, [
      buildJoinResultRow(room, join, path, elapsedMs, relayAddress, new Date()),
    ]);
  }

  /** 记录开局后各加入者的连接质量，一次轮询带来的几段写成几行。 */
  async recordConnectionQuality(
    room: LauncherRoom,
    records: ConnectionQualityRecord[],
  ): Promise<void> {
    const now = new Date();
    await this.insert(
      LAUNCHER_ROOM_EVENTS_TABLE,
      records.map((record) => buildConnectionQualityRow(room, record, now)),
    );
  }

  /** 记录加入者连通后实测直连与中转的结果，一次轮询带来的几条写成几行。 */
  async recordRouteChecks(room: LauncherRoom, records: RouteCheckRecord[]): Promise<void> {
    const now = new Date();
    await this.insert(
      LAUNCHER_ROOM_EVENTS_TABLE,
      records.map((record) => buildRouteCheckRow(room, record, now)),
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
