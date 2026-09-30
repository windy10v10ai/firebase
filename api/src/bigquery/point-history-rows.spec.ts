import { Player } from '../player/entities/player.entity';

import { buildPointHistoryRows } from './point-history-rows';

describe('buildPointHistoryRows', () => {
  const createdAt = new Date('2026-09-30T00:00:00Z');
  const after = {
    seasonPointTotal: 1_500,
    usedSeasonPoint: 200,
    memberPointTotal: 3_000,
    usedMemberPoint: 1_000,
  } as Player;

  it('每种有变动的积分一行，获得与花掉分列，余额取写入后的累计与已用', () => {
    const rows = buildPointHistoryRows(
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
        added: 0,
        used: 200,
        total_after: 1_500,
        used_after: 200,
        reason: 'kofi_points',
        ref: 'tx-1',
      },
      {
        created_at: '2026-09-30T00:00:00.000Z',
        steam_id: 123,
        point_type: 'member',
        added: 1_000,
        used: 0,
        total_after: 3_000,
        used_after: 1_000,
        reason: 'kofi_points',
        ref: 'tx-1',
      },
    ]);
  });
});
