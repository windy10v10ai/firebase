import { Injectable } from '@nestjs/common';
import { logger } from 'firebase-functions/v2';

import { BigQueryService } from '../bigquery/bigquery.service';
import { DailyStatsService } from '../daily-stats/daily-stats.service';

import { PlayerStatsRadar, PlayerStatsRadarResponse } from './dto/player-stats-radar.response';
import { PlayerStatsRecentMatch } from './entities/player-stats-recent.entity';
import { DifficultyBaseline } from './entities/radar-baseline';
import {
  STATS_LIFETIME_MAX_DIRE_MULTIPLIER,
  STATS_LIFETIME_MAX_RADIANT_MULTIPLIER,
  STATS_LIFETIME_MIN_RESPAWN_TIME_PCT,
} from './player-stats-lifetime.constants';
import {
  RADAR_AXES,
  RADAR_AXIS_DEFINITIONS,
  RADAR_HEALING_AVERAGE_MULTIPLIER,
  RADAR_MIN_MATCHES,
  RadarAxis,
  STATS_BASELINE_MIN_SAMPLES,
  STATS_BASELINE_QUANTILE_STEPS,
  STATS_BASELINE_WINDOW_DAYS,
} from './player-stats-radar.constants';
import { PlayerStatsRecentService } from './player-stats-recent.service';

@Injectable()
export class PlayerStatsRadarService {
  constructor(
    private readonly dailyStatsService: DailyStatsService,
    private readonly bigQueryService: BigQueryService,
    private readonly playerStatsRecentService: PlayerStatsRecentService,
  ) {}

  /** 从 BigQuery 重算全体基准并整份覆盖写回 Firestore。 */
  async refreshBaseline(): Promise<{ difficulties: number } | null> {
    // 排除口径与生涯战绩一致，刷分局的数据不能拉高基准
    const rows = await this.bigQueryService.queryStatsBaseline({
      windowDays: STATS_BASELINE_WINDOW_DAYS,
      maxMultiplierRadiant: STATS_LIFETIME_MAX_RADIANT_MULTIPLIER,
      maxMultiplierDire: STATS_LIFETIME_MAX_DIRE_MULTIPLIER,
      minRespawnTimePct: STATS_LIFETIME_MIN_RESPAWN_TIME_PCT,
      quantileSteps: STATS_BASELINE_QUANTILE_STEPS,
    });
    if (!rows) {
      return null;
    }

    const difficulties: Record<string, DifficultyBaseline> = {};
    for (const row of rows) {
      if (row.sample_count < STATS_BASELINE_MIN_SAMPLES) {
        continue;
      }
      difficulties[row.difficulty.toString()] = {
        sampleCount: row.sample_count,
        damage: row.damage,
        gold: row.gold,
        participation: row.participation,
        push: row.push,
        deaths: row.deaths,
        tank: row.tank,
        healing: row.healing,
        assists: row.assists,
        stuns: row.stuns,
      };
    }

    await this.dailyStatsService.save('radarBaseline', { difficulties });
    return { difficulties: Object.keys(difficulties).length };
  }

  /** 拿玩家最近的场次逐局算出在同难度玩家中的百分位，得出六边形各项与综合评分。 */
  async getRadar(steamId: number): Promise<PlayerStatsRadarResponse> {
    const [recent, baseline] = await Promise.all([
      this.playerStatsRecentService.findBySteamId(steamId),
      this.dailyStatsService.get('radarBaseline'),
    ]);
    if (!baseline) {
      logger.warn('[StatsRadar] baseline missing');
    }
    return buildRadar(recent?.matches ?? [], baseline?.difficulties ?? {});
  }
}

export function buildRadar(
  matches: PlayerStatsRecentMatch[],
  difficulties: Record<string, DifficultyBaseline>,
): PlayerStatsRadarResponse {
  const sums = Object.fromEntries(RADAR_AXES.map((axis) => [axis, 0])) as Record<RadarAxis, number>;
  let matchCount = 0;

  for (const match of matches) {
    const base = difficulties[match.difficulty?.toString()];
    // 掉线局的数据不代表水平，基准里也排除了；基准缺项时这一局整局不比，免得各项局数不一致
    if (
      !base ||
      !RADAR_AXES.every((axis) => base[axis]?.length) ||
      match.isDisconnected ||
      !(match.durationSec > 0)
    ) {
      continue;
    }
    const minutes = match.durationSec / 60;
    for (const axis of RADAR_AXES) {
      const { value, perMinute, inverse, zeroIsFloor } = RADAR_AXIS_DEFINITIONS[axis];
      const raw = value(match) ?? 0;
      const own = perMinute ? raw / minutes : raw;
      const percentile = zeroIsFloor
        ? nonZeroPercentileOf(own, base[axis])
        : percentileOf(own, base[axis]);
      sums[axis] += inverse ? 100 - percentile : percentile;
    }
    matchCount++;
  }

  if (matchCount < RADAR_MIN_MATCHES) {
    return { matchCount, minMatchCount: RADAR_MIN_MATCHES, radar: null };
  }

  const averages = Object.fromEntries(
    RADAR_AXES.map((axis) => [axis, sums[axis] / matchCount]),
  ) as Record<RadarAxis, number>;
  averages.healing = Math.min(100, averages.healing * RADAR_HEALING_AVERAGE_MULTIPLIER);
  const radar: PlayerStatsRadar = Object.fromEntries(
    RADAR_AXES.map((axis) => [axis, Math.round(averages[axis])]),
  ) as Record<RadarAxis, number>;
  return { matchCount, minMatchCount: RADAR_MIN_MATCHES, radar };
}

/** 在等距分位点上线性插值，求一个值在全体中的百分位（0–100）。 */
export function percentileOf(value: number, quantiles: number[]): number {
  const last = quantiles.length - 1;
  const step = 100 / last;
  // 整数项常有多个分位点同值，落在这一段时取中间，免得同样的表现得分偏高或偏低
  const first = quantiles.findIndex((q) => q >= value);
  if (first === -1) {
    return 100;
  }
  if (quantiles[first] === value) {
    let end = first;
    while (end < last && quantiles[end + 1] === value) {
      end++;
    }
    return ((first + end) / 2) * step;
  }
  if (first === 0) {
    return 0;
  }
  const low = quantiles[first - 1];
  const high = quantiles[first];
  return (first - 1 + (value - low) / (high - low)) * step;
}

/** 0 记 0 分；大于 0 的值在全体里 0 值占满的那一段之后重新排名，铺满 0–100。 */
export function nonZeroPercentileOf(value: number, quantiles: number[]): number {
  if (!(value > 0)) {
    return 0;
  }
  const last = quantiles.length - 1;
  const zeroCount = quantiles.filter((q) => q <= 0).length;
  if (zeroCount >= last) {
    return 100;
  }
  const zeroTop = (zeroCount / last) * 100;
  const rescaled = ((percentileOf(value, quantiles) - zeroTop) / (100 - zeroTop)) * 100;
  return Math.min(100, Math.max(0, rescaled));
}
