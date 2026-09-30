import { logger } from 'firebase-functions/v2';

import { Player } from '../player/entities/player.entity';

import { BigQueryService } from './bigquery.service';

describe('BigQueryService', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  function createService(insert: jest.Mock) {
    process.env.NODE_ENV = 'production';
    process.env.BIGQUERY_DATASET = 'game_data_dev';
    const service = new BigQueryService();
    const table = jest.fn().mockReturnValue({ insert });
    const dataset = jest.fn().mockReturnValue({ table });
    Object.assign(service, { client: { dataset } });
    return { service, dataset, table };
  }

  const after = { seasonPointTotal: 100, memberPointTotal: 0 } as Player;

  it('写入配置的数据集与积分流水表', async () => {
    const insert = jest.fn().mockResolvedValue([{}]);
    const { service, dataset, table } = createService(insert);

    await service.recordPointChange(1, { seasonPointTotal: 100 }, after, { reason: 'game_end' });

    expect(dataset).toHaveBeenCalledWith('game_data_dev');
    expect(table).toHaveBeenCalledWith('point_ledger');
    expect(insert).toHaveBeenCalledWith([expect.objectContaining({ steam_id: 1, delta: 100 })]);
  });

  it('写入失败只记日志，不向调用方抛错', async () => {
    const insert = jest.fn().mockRejectedValue(new Error('boom'));
    const { service } = createService(insert);
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => undefined);

    await expect(
      service.recordPointChange(1, { memberPointTotal: 100 }, after, { reason: 'alipay_points' }),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      '[BigQuery] insert failed',
      expect.objectContaining({ tableId: 'point_ledger', error: 'boom' }),
    );
  });

  it('没有配置数据集时不写入', async () => {
    const insert = jest.fn();
    const { service } = createService(insert);
    Object.assign(service, { datasetId: undefined });

    await service.recordPointChange(1, { seasonPointTotal: 100 }, after, { reason: 'game_end' });

    expect(insert).not.toHaveBeenCalled();
  });
});
