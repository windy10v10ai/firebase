import { INestApplication } from '@nestjs/common';

import { MemberDto } from '../../src/members/dto/member.dto';
import { MembersService } from '../../src/members/members.service';
import { PlayerSetting } from '../../src/player/entities/player-setting.entity';
import { Player } from '../../src/player/entities/player.entity';
import { PlayerSettingService } from '../../src/player/player-setting.service';
import { PlayerService } from '../../src/player/player.service';

import { get, put } from './util-http';

interface createPlayerParams {
  steamId: number;
  seasonPointTotal?: number;
  memberPointTotal?: number;
}

export async function createPlayer(
  app: INestApplication,
  params: createPlayerParams,
): Promise<void> {
  const playerService = app.get(PlayerService);
  await playerService.upsertAddPoint(params.steamId, {
    seasonPointTotal: params.seasonPointTotal,
    memberPointTotal: params.memberPointTotal,
  });
}

export async function getPlayer(app: INestApplication, steamId: number): Promise<Player> {
  const playerService = app.get(PlayerService);
  const player = await playerService.findBySteamId(steamId);
  return player;
}

export async function getPlayerSetting(
  app: INestApplication,
  playerId: string,
): Promise<PlayerSetting> {
  const playerSettingService = app.get(PlayerSettingService);
  const playerSetting = await playerSettingService.getPlayerSettingOrGenerateDefault(playerId);
  return playerSetting;
}

export async function getMemberDto(app: INestApplication, steamId: number): Promise<MemberDto> {
  const memberService = app.get(MembersService);
  const memberDto = await memberService.findBySteamId(steamId);
  return memberDto;
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
