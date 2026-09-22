import { BadRequestException } from '@nestjs/common';

import { GameEndDto } from '../analytics/dto/game-end-dto';

import { decodeProxyBody } from './proxy-request.util';

const player = {
  heroName: 'npc_dota_hero_abaddon',
  steamId: 1001,
  teamId: 2,
  isDisconnected: false,
  level: 30,
  totalGoldEarned: 1000,
  kills: 1,
  deaths: 1,
  assists: 1,
  score: 1,
  battlePoints: 10,
  lastHits: 1,
  heroDamage: 1,
  damageTaken: 1,
  healing: 0,
  towerKills: 0,
};

const BASE = { matchId: '1', version: 'v1', difficulty: 0, playerCount: 1 };

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

describe('decodeProxyBody', () => {
  it('还原成带嵌套类型的 GameEndDto', async () => {
    const dto = await decodeProxyBody(
      GameEndDto,
      encode({ ...BASE, players: [player], winnerTeamId: 2 }),
    );

    expect(dto).toBeInstanceOf(GameEndDto);
    expect(dto.players).toHaveLength(1);
    expect(dto.players[0].steamId).toBe(1001);
  });

  it('含中文与 URL 不安全字符的内容也能往返', async () => {
    const dto = await decodeProxyBody(
      GameEndDto,
      encode({ ...BASE, players: [{ ...player, heroName: '勇士>?/+' }] }),
    );

    expect(dto.players[0].heroName).toBe('勇士>?/+');
  });

  it.each([
    ['空串', ''],
    ['不是 JSON', Buffer.from('not json').toString('base64url')],
    ['JSON 不是对象', encode([1, 2])],
  ])('%s 抛 BadRequestException', async (_name, encoded) => {
    await expect(decodeProxyBody(GameEndDto, encoded)).rejects.toThrow(BadRequestException);
  });

  it('DTO 校验不通过（缺 matchId）抛 BadRequestException', async () => {
    await expect(
      decodeProxyBody(GameEndDto, encode({ version: 'v1', difficulty: 0, players: [player] })),
    ).rejects.toThrow(BadRequestException);
  });

  it('玩家字段校验不通过（负数）抛 BadRequestException', async () => {
    await expect(
      decodeProxyBody(GameEndDto, encode({ ...BASE, players: [{ ...player, kills: -1 }] })),
    ).rejects.toThrow(BadRequestException);
  });
});
