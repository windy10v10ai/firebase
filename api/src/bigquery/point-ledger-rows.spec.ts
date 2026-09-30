import { Player } from '../player/entities/player.entity';

import { buildPointLedgerRows } from './point-ledger-rows';

describe('buildPointLedgerRows', () => {
  const createdAt = new Date('2026-09-30T00:00:00Z');
  const after = {
    seasonPointTotal: 1_500,
    usedSeasonPoint: 200,
    memberPointTotal: 3_000,
    usedMemberPoint: 1_000,
  } as Player;

  it('每个有变动的字段一行，余额取对应积分类型的累计与已用', () => {
    const rows = buildPointLedgerRows(
      123,
      { memberPointTotal: 1_000, usedSeasonPoint: 200, seasonPointTotal: 0 },
      after,
      { reason: 'kofi_points', ref: 'tx-1' },
      createdAt,
    );

    expect(rows).toEqual([
      {
        created_at: '2026-09-30T00:00:00.000Z',
        steam_id: 123,
        point_type: 'battle',
        field: 'used',
        delta: 200,
        total_after: 1_500,
        used_after: 200,
        reason: 'kofi_points',
        ref: 'tx-1',
      },
      {
        created_at: '2026-09-30T00:00:00.000Z',
        steam_id: 123,
        point_type: 'member',
        field: 'total',
        delta: 1_000,
        total_after: 3_000,
        used_after: 1_000,
        reason: 'kofi_points',
        ref: 'tx-1',
      },
    ]);
  });
});
