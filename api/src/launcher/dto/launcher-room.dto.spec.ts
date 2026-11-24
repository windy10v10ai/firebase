import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';

import { HostRoomDto, JoinRoomDto, ListRoomsDto } from './launcher-room.dto';

// 与 src/util/settings.ts 里的全局管道同配置
const pipe = new ValidationPipe({ transform: true, forbidUnknownValues: false });
const meta = (metatype: ArgumentMetadata['metatype']): ArgumentMetadata => ({
  type: 'body',
  metatype,
});
const LIST = { steamId: 1, protocolVersion: 1 };
const PEER = {
  steamId: 1,
  candidates: ['lan:192.168.1.2:27015'],
  upnp: false,
  publicIp: false,
  protocolVersion: 1,
  launcherVersion: '0.9.0',
};

describe('launcher edition validation', () => {
  it.each([
    [{}],
    [{ mapVersions: {} }],
    [{ mapVersions: { original: '1' } }],
    [{ mapVersions: { original: '1', anime: '2' }, mapVersion: '1' }],
  ])('列表接受 %j', async (extra) => {
    const res = (await pipe.transform({ ...LIST, ...extra }, meta(ListRoomsDto))) as ListRoomsDto;
    expect(res.mapVersions).toEqual((extra as Partial<ListRoomsDto>).mapVersions);
  });

  it.each([
    [{ mapVersions: null }],
    [{ mapVersions: [] }],
    [{ mapVersions: 1 }],
    [{ mapVersions: 'x' }],
    [{ mapVersions: { anime: null } }],
    [{ mapVersions: { anime: 1 } }],
  ])('列表拒绝 %j', async (extra) => {
    await expect(pipe.transform({ ...LIST, ...extra }, meta(ListRoomsDto))).rejects.toMatchObject({
      status: 400,
    });
  });

  it.each([[{ edition: 'original' }], [{ edition: 'anime' }], [{}]])(
    '开房与加入接受 %j',
    async (extra) => {
      for (const type of [HostRoomDto, JoinRoomDto]) {
        await expect(pipe.transform({ ...PEER, ...extra }, meta(type))).resolves.toBeDefined();
      }
    },
  );

  it.each([[null], ['Anime'], [''], [1], [[]], [{}]])(
    '开房与加入拒绝 edition=%j',
    async (edition) => {
      for (const type of [HostRoomDto, JoinRoomDto]) {
        await expect(pipe.transform({ ...PEER, edition }, meta(type))).rejects.toMatchObject({
          status: 400,
        });
      }
    },
  );
});
