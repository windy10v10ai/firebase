import { generateKeyPairSync, verify } from 'crypto';

import { SecretService } from '../util/secret/secret.service';

import { LauncherRelayService, RELAY_TICKET_TTL_MS } from './launcher-relay.service';

describe('LauncherRelayService', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const secretService = {
    getSecretValue: () => privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  } as unknown as SecretService;
  const service = new LauncherRelayService(secretService);
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

  it('没配中转地址时不发通行证', () => {
    expect(service.issue('join-1', 'h', now, '')).toBeUndefined();
  });
});
