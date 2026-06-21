import { INestApplication } from '@nestjs/common';

import { MemberDto } from '../../src/members/dto/member.dto';
import { MembersService } from '../../src/members/members.service';
import { PlayerSetting } from '../../src/player/entities/player-setting.entity';
import { PlayerStatsLifetime } from '../../src/player/entities/player-stats-lifetime.entity';
import { Player } from '../../src/player/entities/player.entity';
import { PlayerSettingService } from '../../src/player/player-setting.service';
import { PlayerStatsLifetimeService } from '../../src/player/player-stats-lifetime.service';
import { PlayerService } from '../../src/player/player.service';
import { PlayerInfoDto } from '../../src/player-info/dto/player-info.dto';
import { PlayerInfoService } from '../../src/player-info/player-info.service';

import { put } from './util-http';

interface createPlayerParams {
  steamId: number;
  seasonPointTotal?: number;
  memberPointTotal?: number;
  usedSeasonPoint?: number;
  usedMemberPoint?: number;
  conductPoint?: number;
}

export async function createPlayer(
  app: INestApplication,
  params: createPlayerParams,
): Promise<void> {
  const playerService = app.get(PlayerService);
  await playerService.upsertAddPoint(params.steamId, {
    seasonPointTotal: params.seasonPointTotal,
    memberPointTotal: params.memberPointTotal,
    usedSeasonPoint: params.usedSeasonPoint,
    usedMemberPoint: params.usedMemberPoint,
  });
  if (params.conductPoint !== undefined) {
    await playerService.setConductPoint(params.steamId, params.conductPoint);
  }
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
  const result = await put(app, `/api/player/${steamId}/property`, {
    name: property,
    level: value,
  });
  expect(result.status).toEqual(200);
}

export async function awakenHero(
  app: INestApplication,
  steamId: number,
  heroName: string,
  useMemberPoint: boolean,
) {
  return put(app, `/api/player/${steamId}/hero-awakening`, { heroName, useMemberPoint });
}

export async function getPlayerDto(app: INestApplication, steamId: number): Promise<PlayerInfoDto> {
  const playerInfoService = app.get(PlayerInfoService);
  return playerInfoService.findPlayerInfoBySteamId(steamId, ['property', 'setting']);
}

export async function getPlayerStatsLifetime(
  app: INestApplication,
  steamId: number,
): Promise<PlayerStatsLifetime | null> {
  const service = app.get(PlayerStatsLifetimeService);
  return service.findBySteamId(steamId);
}
