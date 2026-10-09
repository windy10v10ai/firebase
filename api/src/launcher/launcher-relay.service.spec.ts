import { generateKeyPairSync, verify } from 'crypto';

import {
  LAUNCHER_RELAYS,
  LauncherRelay,
  LauncherRelayService,
  RELAY_TICKET_TTL_MS,
} from './launcher-relay.service';

describe('LauncherRelayService', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  process.env.LAUNCHER_RELAY_PRIVATE_KEY = privateKey
    .export({ type: 'pkcs8', format: 'pem' })
    .toString();
  const service = new LauncherRelayService();
  const now = new Date('2026-10-05T12:00:00Z');

  it('签出的通行证能用公钥验证，载荷带加入编号、身份与过期时间', () => {
    const relay = service.issue('join-1', 'j', now, ['1.2.3.4:3478', '5.6.7.8:3478'])!;

    const [payload, signature] = relay.ticket.split('.');
    expect(relay.address).toEqual('1.2.3.4:3478');
    expect(relay.addresses).toEqual(['1.2.3.4:3478', '5.6.7.8:3478']);
    expect(
      verify(
        null,
        Buffer.from(payload, 'base64url'),
        publicKey,
        Buffer.from(signature, 'base64url'),
      ),
    ).toBe(true);
    expect(JSON.parse(Buffer.from(payload, 'base64url').toString())).toEqual({
      j: 'join-1',
      r: 'j',
      e: (now.getTime() + RELAY_TICKET_TTL_MS) / 1000,
    });
  });

  it('没有中转可试或没配私钥时不发通行证', () => {
    expect(service.issue('join-1', 'h', now, [])).toBeUndefined();
    expect(new LauncherRelayService().issue('join-1', 'h', now, ['1.2.3.4:3478'])).toBeDefined();
    delete process.env.LAUNCHER_RELAY_PRIVATE_KEY;
    expect(new LauncherRelayService().issue('join-1', 'h', now, ['1.2.3.4:3478'])).toBeUndefined();
  });

  describe('order', () => {
    const configured = [...LAUNCHER_RELAYS];
    const use = (relays: LauncherRelay[]) => LAUNCHER_RELAYS.splice(0, Infinity, ...relays);
    afterEach(() => use(configured));
    const probe = (address: string, rtt: number | undefined, loss = 0) => ({ address, rtt, loss });

    it('旧版一方只测过第一台时固定用第一台，新版双方按优先级与延迟排序', () => {
      use([
        { address: 'a', priority: 1 },
        { address: 'b', priority: 1 },
        { address: 'c', priority: 2 },
      ]);
      const host = [probe('a', 30), probe('b', 20), probe('c', 5)];

      expect(service.order(undefined, host)).toEqual(['a']);
      expect(service.order(host, [])).toEqual(['a']);
      expect(service.order(host, [probe('a', 30), probe('b', 20), probe('c', 5)])).toEqual([
        'b',
        'a',
        'c',
      ]);
    });

    it('丢包太多或没测到的排最后，优先的那台慢太多时改用最快的', () => {
      use([
        { address: 'a', priority: 1 },
        { address: 'b', priority: 2 },
      ]);

      expect(
        service.order([probe('a', 10, 20), probe('b', 40)], [probe('a', 10), probe('b', 40)]),
      ).toEqual(['b', 'a']);
      expect(service.order([probe('a', 50), probe('b', 10)], [probe('a', 50)])).toEqual(['a', 'b']);
      expect(
        service.order([probe('a', 50), probe('b', 10)], [probe('a', 50), probe('b', 10)]),
      ).toEqual(['b', 'a']);
      expect(
        service.order([probe('a', 20), probe('b', 10)], [probe('a', 20), probe('b', 10)]),
      ).toEqual(['a', 'b']);
    });

    it('列表清空即关掉中转', () => {
      use([]);
      expect(service.order([probe('a', 1)], [probe('a', 1)])).toEqual([]);
    });
  });
});
