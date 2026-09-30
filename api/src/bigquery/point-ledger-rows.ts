import { UpdatePlayerDto } from '../player/dto/update-player.dto';
import { Player } from '../player/entities/player.entity';

export interface PointChangeSource {
  reason: string;
  /** 结算的 gameId 或支付订单号 */
  ref?: string;
}

const POINT_FIELDS = [
  { key: 'seasonPointTotal', pointType: 'battle', field: 'total' },
  { key: 'usedSeasonPoint', pointType: 'battle', field: 'used' },
  { key: 'memberPointTotal', pointType: 'member', field: 'total' },
  { key: 'usedMemberPoint', pointType: 'member', field: 'used' },
] as const;

/** 按本次变动量给每个有变化的积分字段生成一行流水，余额取写入后的玩家档案。 */
export function buildPointLedgerRows(
  steamId: number,
  delta: UpdatePlayerDto,
  after: Player,
  source: PointChangeSource,
  createdAt: Date,
): Record<string, unknown>[] {
  return POINT_FIELDS.filter(({ key }) => delta[key]).map(({ key, pointType, field }) => ({
    created_at: createdAt.toISOString(),
    steam_id: steamId,
    point_type: pointType,
    field,
    delta: delta[key],
    total_after:
      pointType === 'battle' ? (after.seasonPointTotal ?? 0) : (after.memberPointTotal ?? 0),
    used_after:
      pointType === 'battle' ? (after.usedSeasonPoint ?? 0) : (after.usedMemberPoint ?? 0),
    reason: source.reason,
    ref: source.ref ?? null,
  }));
}
