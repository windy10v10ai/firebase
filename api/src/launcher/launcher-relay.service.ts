import { KeyObject, createPrivateKey, sign } from 'crypto';

import { Injectable } from '@nestjs/common';

import { SECRET, SecretService } from '../util/secret/secret.service';

import { RelayDto } from './dto/launcher-room.dto';

// 空串时不发通行证，启动器只试局域网与打洞；中转出问题时清空它重新部署即可关掉中转
export const LAUNCHER_RELAY_ADDRESS = '123.207.219.78:27200';
// 掉线重连要拿同一张通行证重新认领，有效期要盖住一整局
export const RELAY_TICKET_TTL_MS = 6 * 60 * 60 * 1000;

export type RelayRole = 'h' | 'j';

@Injectable()
export class LauncherRelayService {
  constructor(private readonly secretService: SecretService) {}

  private privateKey?: KeyObject;

  /** 给一次加入的房主或加入者签中转通行证，没配中转地址时返回 undefined。 */
  issue(
    joinId: string,
    role: RelayRole,
    now: Date,
    address = LAUNCHER_RELAY_ADDRESS,
  ): RelayDto | undefined {
    if (!address) {
      return undefined;
    }
    this.privateKey ??= createPrivateKey(
      this.secretService.getSecretValue(SECRET.LAUNCHER_RELAY_PRIVATE_KEY),
    );
    const payload = Buffer.from(
      JSON.stringify({
        j: joinId,
        r: role,
        e: Math.floor((now.getTime() + RELAY_TICKET_TTL_MS) / 1000),
      }),
    );
    const signature = sign(null, payload, this.privateKey);
    return {
      address,
      ticket: `${payload.toString('base64url')}.${signature.toString('base64url')}`,
    };
  }
}
