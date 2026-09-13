// 站内项固定顺序：个人主页、属性、觉醒、会员、技能物品，见 docs/design/web/phase-2g-header-layout.md
// 觉醒、技能物品还没有页面，先不给 href，头部据此跳过渲染
// 玩家自己的页面指向 /my/*：菜单里拼不出 steamId，登录后由那一页转到 /profile/<id>/*
export const SITE_NAV_ITEMS = [
  { key: 'profile', shortLabelKey: 'profile', fullLabelKey: 'profileFull', href: '/my' },
  { key: 'property', shortLabelKey: 'property', fullLabelKey: 'propertyFull', href: '/my/property' },
  { key: 'awaken', shortLabelKey: 'awaken', fullLabelKey: 'awakenFull', href: null },
  { key: 'membership', shortLabelKey: 'membershipShort', fullLabelKey: 'membership', href: '/membership' },
  { key: 'wiki', shortLabelKey: 'wiki', fullLabelKey: 'wikiFull', href: null },
] as const;
