import { UpdatePlayerDto } from '../player/dto/update-player.dto';
import { Player } from '../player/entities/player.entity';

export interface PointChangeSource {
  reason: string;
  /** 结算的 gameId 或支付订单号 */
  ref?: string;
}

const POINT_TYPES = [
  { pointType: 'battle', totalKey: 'seasonPointTotal', usedKey: 'usedSeasonPoint' },
  { pointType: 'member', totalKey: 'memberPointTotal', usedKey: 'usedMemberPoint' },
] as const;

// 结算积分没有逐个校验整数，写 INT64 列前先取整，免得一个小数让这一行写入失败
function toInt(value: number | undefined): number {
  return Math.round(value ?? 0);
}

/** 每种有变动的积分生成一行，余额取写入后的玩家档案。 */
export function buildPointHistoryRows(
  steamId: number,
  delta: UpdatePlayerDto,
  after: Player,
  source: PointChangeSource,
  createdAt: Date,
): Record<string, unknown>[] {
  return POINT_TYPES.filter(({ totalKey, usedKey }) => delta[totalKey] || delta[usedKey]).map(
    ({ pointType, totalKey, usedKey }) => ({
      created_at: createdAt.toISOString(),
      steam_id: steamId,
      point_type: pointType,
      added: toInt(delta[totalKey]),
      used: toInt(delta[usedKey]),
      total_after: toInt(after[totalKey]),
      used_after: toInt(after[usedKey]),
      reason: source.reason,
      ref: source.ref ?? null,
    }),
  );
}
