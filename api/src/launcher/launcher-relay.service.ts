import { KeyObject, createPrivateKey, sign } from 'crypto';

import { Injectable } from '@nestjs/common';

import { SECRET } from '../util/secret/secret.service';

import { RelayDto, RelayProbeDto, RouteCheckDto } from './dto/launcher-room.dto';

export interface LauncherRelay {
  address: string;
  /** 数字小的优先，同优先级按估算延迟选 */
  priority: number;
}

// 清空列表就不发通行证，启动器只试局域网与打洞，中转出问题时用它关掉中转。
// 第一台是 0.5.2 及更早的启动器唯一会测、会连的一台，它们没有备用线路，所以放最稳定、不按流量计费的那台
export const LAUNCHER_RELAYS: LauncherRelay[] = [
  // 国内两台都是锐驰型，包月不限流量，放在两地，一处线路出问题另一台还能接；第二台晚高峰游戏中丢包明显更多，只在快得多或第一台不可用时接手
  { address: '118.195.194.163:27200', priority: 1 },
  { address: '159.75.243.15:27200', priority: 2 },
  // 海外两台是入门型，流量包有上限，只在比国内快得多时被提前；新加坡给东南亚、澳洲，法兰克福给俄语区
  { address: '43.134.232.163:27200', priority: 2 },
  { address: '43.131.58.91:27200', priority: 2 },
];
// 掉线重连要拿同一张通行证重新认领，房间跨局保留时加入者会连着打很多局，有效期按一整天算
export const RELAY_TICKET_TTL_MS = 24 * 60 * 60 * 1000;
// 加入前的回声测试包数少，丢包到这个程度基本是线路在丢，进游戏也好不了
const RELAY_LOSS_LIMIT_PCT = 10;
// 线路得分 = 延迟 + 丢包百分比 × 这个毫秒数，排中转与加入后选线共用：丢包几个百分点比慢几十毫秒更卡
const LOSS_COST_MS = 10;
// 得分好出这么多才放弃优先的那台中转或直连，差不多时不为一点差距多占中转
const SWITCH_MARGIN_MS = 30;
// 游戏中一秒内游戏数据丢包到这个比例算一个坏秒，窗口里坏秒够数才拿两条线路比得分；偶发几秒的抖动不值得换线
const BAD_LOSS_PCT = 10;
const BAD_SECONDS = 6;
const WINDOW_SECONDS = 10;

// 0.6.0 只认丢包阈值、不看延迟，远距离时会换到绕路的中转，所以只发得分参数，它读不到就不做加入后选线
export const ROUTE_CHECK: RouteCheckDto = {
  lossCostMs: LOSS_COST_MS,
  switchMarginMs: SWITCH_MARGIN_MS,
  badLossPct: BAD_LOSS_PCT,
  badSeconds: BAD_SECONDS,
  windowSeconds: WINDOW_SECONDS,
};

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
      const cost = usable
        ? h.rtt! + j.rtt! + (h.loss + j.loss) * LOSS_COST_MS
        : Number.POSITIVE_INFINITY;
      return { ...relay, usable, cost };
    });
    const usable = scored
      .filter((relay) => relay.usable)
      .sort((a, b) => a.priority - b.priority || a.cost - b.cost);
    const fastest = usable.reduce<(typeof usable)[number] | undefined>(
      (best, relay) => (!best || relay.cost < best.cost ? relay : best),
      undefined,
    );
    if (fastest && usable[0].cost - fastest.cost > SWITCH_MARGIN_MS) {
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
