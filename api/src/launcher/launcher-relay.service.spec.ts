import { generateKeyPairSync, verify } from 'crypto';

import { LauncherRelayService, RELAY_TICKET_TTL_MS } from './launcher-relay.service';

describe('LauncherRelayService', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  process.env.LAUNCHER_RELAY_PRIVATE_KEY = privateKey
    .export({ type: 'pkcs8', format: 'pem' })
    .toString();
  const service = new LauncherRelayService();
  const now = new Date('2026-10-05T12:00:00Z');

  it('签出的通行证能用公钥验证，载荷带加入编号、身份与过期时间', () => {
    const relay = service.issue('join-1', 'j', now, '1.2.3.4:3478')!;

    const [payload, signature] = relay.ticket.split('.');
    expect(relay.address).toEqual('1.2.3.4:3478');
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

  it('没配中转地址或私钥时不发通行证', () => {
    expect(service.issue('join-1', 'h', now, '')).toBeUndefined();
    expect(new LauncherRelayService().issue('join-1', 'h', now, '1.2.3.4:3478')).toBeDefined();
    delete process.env.LAUNCHER_RELAY_PRIVATE_KEY;
    expect(new LauncherRelayService().issue('join-1', 'h', now, '1.2.3.4:3478')).toBeUndefined();
  });
});
