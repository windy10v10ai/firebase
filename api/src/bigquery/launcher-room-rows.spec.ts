import { LauncherRoomJoin } from '../launcher/entities/launcher-room-join.entity';
import { LauncherRoom } from '../launcher/entities/launcher-room.entity';

import { buildConnectionQualityRow, buildJoinResultRow } from './launcher-room-rows';

describe('buildConnectionQualityRow', () => {
  const room = {
    roomId: 'room-1',
    hostSteamId: 1001,
    hostUpnp: false,
    hostPublicIp: false,
  } as LauncherRoom;
  const join = {
    steamId: 2002,
    upnp: true,
    launcherVersion: '0.5.0',
    country: 'CN',
  } as LauncherRoomJoin;

  it('加入者的身份与这段时间的测速结果写成一行', () => {
    const row = buildConnectionQualityRow(
      room,
      {
        join,
        quality: { joinId: 'j', path: 'relay', sent: 30, lost: 3, rttP50: 45, rttP95: 120 },
        relayAddress: '1.2.3.4:27200',
      },
      new Date('2026-10-06T00:00:00Z'),
    );

    expect(row).toMatchObject({
      event: 'connection_quality',
      room_id: 'room-1',
      path: 'relay',
      relay_address: '1.2.3.4:27200',
      ping_sent: 30,
      ping_lost: 3,
      rtt_p50_ms: 45,
      rtt_p95_ms: 120,
      steam_id: 2002,
      host_steam_id: 1001,
      country: 'CN',
    });
  });

  it('全部丢失时延迟为空', () => {
    const row = buildConnectionQualityRow(
      room,
      {
        join,
        quality: { joinId: 'j', path: 'punch', sent: 30, lost: 30 },
        relayAddress: undefined,
      },
      new Date(),
    );

    expect(row).toMatchObject({ rtt_p50_ms: null, rtt_p95_ms: null, relay_address: null });
  });
});

describe('buildJoinResultRow', () => {
  it('房主与加入者到每台中转的测量按地址合并成一组', () => {
    const row = buildJoinResultRow(
      {
        roomId: 'room-1',
        hostSteamId: 1001,
        relays: [
          { address: 'a', rtt: 10, loss: 0 },
          { address: 'b', loss: 100 },
        ],
      } as LauncherRoom,
      { steamId: 2002, relays: [{ address: 'a', rtt: 20, loss: 5 }] } as LauncherRoomJoin,
      'relay',
      1500,
      'a',
      new Date(),
    );

    expect(row.relay_probes).toEqual([
      { address: 'a', host_rtt_ms: 10, host_loss_pct: 0, joiner_rtt_ms: 20, joiner_loss_pct: 5 },
      {
        address: 'b',
        host_rtt_ms: null,
        host_loss_pct: 100,
        joiner_rtt_ms: null,
        joiner_loss_pct: null,
      },
    ]);
  });
});
