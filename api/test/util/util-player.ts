import { INestApplication } from '@nestjs/common';

import { Player } from '../../src/player/entities/player.entity';

import { get, patch, put } from './util-http';

interface createPlayerParams {
  steamId: number;
  seasonPointTotal: number;
  memberPointTotal: number;
}

export async function createPlayer(
  app: INestApplication,
  params: createPlayerParams,
): Promise<void> {
  const resultAddPoints = await patch(app, `/api/player/steamId/${params.steamId}`, {
    seasonPointTotal: params.seasonPointTotal,
    memberPointTotal: params.memberPointTotal,
  });
  expect(resultAddPoints.status).toEqual(200);
}

export async function getPlayer(app: INestApplication, steamId: number): Promise<Player> {
  const result = await get(app, `/api/player/steamId/${steamId}`);
  expect(result.status).toEqual(200);
  return result.body;
}

export async function addPlayerProperty(
  app: INestApplication,
  steamId: number,
  property: string,
  value: number,
): Promise<void> {
  const result = await put(app, `/api/player-property`, {
    steamId,
    name: property,
    level: value,
  });
  expect(result.status).toEqual(200);
}

export async function getPlayerProperty(app: INestApplication, steamId: number): Promise<number> {
  const result = await get(app, `/api/player-property/steamId/${steamId}`);
  expect(result.status).toEqual(200);
  return result.body;
}
