const IPV4_MAPPED_PREFIX = '::ffff:';
const IPV6_GROUP_COUNT = 8;
const IPV6_PREFIX_GROUP_COUNT = 4;

/** 把来源地址归一成聚合用的形式，取不到地址时返回 undefined。 */
export function normalizeIp(ip: string | undefined): string | undefined {
  const trimmed = ip?.trim();
  if (!trimmed) {
    return undefined;
  }

  const plain = trimmed.startsWith(IPV4_MAPPED_PREFIX)
    ? trimmed.slice(IPV4_MAPPED_PREFIX.length)
    : trimmed;
  return plain.includes(':') ? toPrefix64(plain) : plain;
}

// 家宽给一户分配的是整个 /64，后 64 位随重连变化却仍是同一个来源，
// 保留完整地址会把一台主机散成许多条记录
function toPrefix64(ipv6: string): string {
  const [head, tail = ''] = ipv6.split('::');
  const headGroups = head ? head.split(':') : [];
  const tailGroups = tail ? tail.split(':') : [];
  const padding = Math.max(IPV6_GROUP_COUNT - headGroups.length - tailGroups.length, 0);
  const groups = [...headGroups, ...new Array<string>(padding).fill('0'), ...tailGroups];

  const prefix = groups
    .slice(0, IPV6_PREFIX_GROUP_COUNT)
    .map((group) => group.replace(/^0+(?=.)/, ''));
  while (prefix.length > 0 && prefix[prefix.length - 1] === '0') {
    prefix.pop();
  }
  return `${prefix.join(':')}::`;
}
