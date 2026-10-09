import { KeyObject, createPrivateKey, sign } from 'crypto';

import { Injectable } from '@nestjs/common';

import { SECRET } from '../util/secret/secret.service';

import { RelayDto, RelayProbeDto } from './dto/launcher-room.dto';

export interface LauncherRelay {
  address: string;
  /** 数字小的优先，同优先级按估算延迟选 */
  priority: number;
}

// 清空列表就不发通行证，启动器只试局域网与打洞，中转出问题时用它关掉中转。
// 第一台是 0.5.2 及更早的启动器唯一会测、会连的一台，换它要等旧版用的人很少
export const LAUNCHER_RELAYS: LauncherRelay[] = [
  { address: '123.207.219.78:27200', priority: 1 },
  { address: '118.195.194.163:27200', priority: 1 },
];
// 掉线重连要拿同一张通行证重新认领，有效期要盖住一整局
export const RELAY_TICKET_TTL_MS = 6 * 60 * 60 * 1000;
// 加入前的回声测试包数少，丢包到这个程度基本是线路在丢，进游戏也好不了
const RELAY_LOSS_LIMIT_PCT = 10;
// 同优先级之外再让一步：优先的那台慢太多时，延迟比优先级更影响手感
const RELAY_SLOWER_LIMIT_MS = 30;

export type RelayRole = 'h' | 'j';

@Injectable()
export class LauncherRelayService {
  private privateKey?: KeyObject;

  /** 旧版启动器测延迟用的那台中转，关掉中转时返回 undefined。 */
  address(): string | undefined {
    return LAUNCHER_RELAYS[0]?.address;
  }

  /** 新版启动器要测延迟的全部中转。 */
  addresses(): string[] {
    return LAUNCHER_RELAYS.map((relay) => relay.address);
  }

  /** 按房主与加入者各自测到的结果给一次加入排出要试的中转顺序，双方按同一顺序连接。 */
  order(host: RelayProbeDto[] | undefined, joiner: RelayProbeDto[] | undefined): string[] {
    if (LAUNCHER_RELAYS.length === 0) {
      return [];
    }
    // 旧版只测过第一台，另一方连不上它没测过的中转
    if (!host?.length || !joiner?.length) {
      return [LAUNCHER_RELAYS[0].address];
    }
    const scored = LAUNCHER_RELAYS.map((relay) => {
      const h = host.find((probe) => probe.address === relay.address);
      const j = joiner.find((probe) => probe.address === relay.address);
      const usable =
        h?.rtt !== undefined &&
        j?.rtt !== undefined &&
        h.loss <= RELAY_LOSS_LIMIT_PCT &&
        j.loss <= RELAY_LOSS_LIMIT_PCT;
      return { ...relay, usable, rtt: usable ? h.rtt! + j.rtt! : Number.POSITIVE_INFINITY };
    });
    const usable = scored
      .filter((relay) => relay.usable)
      .sort((a, b) => a.priority - b.priority || a.rtt - b.rtt);
    const fastest = usable.reduce<(typeof usable)[number] | undefined>(
      (best, relay) => (!best || relay.rtt < best.rtt ? relay : best),
      undefined,
    );
    if (fastest && usable[0].rtt - fastest.rtt > RELAY_SLOWER_LIMIT_MS) {
      usable.splice(usable.indexOf(fastest), 1);
      usable.unshift(fastest);
    }
    // 测得差的排在最后：前面的都满了时，差的线路总比连不上强
    return [...usable, ...scored.filter((relay) => !relay.usable)].map((relay) => relay.address);
  }

  /** 给一次加入的房主或加入者签中转通行证，顺序为空或没配私钥时返回 undefined。 */
  issue(joinId: string, role: RelayRole, now: Date, order: string[]): RelayDto | undefined {
    const privateKeyPem = process.env[SECRET.LAUNCHER_RELAY_PRIVATE_KEY];
    // 本地与 e2e 不配私钥，不发通行证，开房与加入照常
    if (order.length === 0 || !privateKeyPem) {
      return undefined;
    }
    this.privateKey ??= createPrivateKey(privateKeyPem);
    const payload = Buffer.from(
      JSON.stringify({
        j: joinId,
        r: role,
        e: Math.floor((now.getTime() + RELAY_TICKET_TTL_MS) / 1000),
      }),
    );
    const signature = sign(null, payload, this.privateKey);
    // 通行证不绑地址，同一张在每台中转上都能认领
    return {
      address: order[0],
      addresses: order,
      ticket: `${payload.toString('base64url')}.${signature.toString('base64url')}`,
    };
  }
}
