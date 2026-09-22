// 站内项固定顺序：个人主页、属性、觉醒、会员、技能物品，见 docs/design/web/phase-2g-header-layout.md
// topFirst 的项在电脑横排里提到最前，菜单仍按本数组的顺序
// desktopOnly 的项在平板横排里让位：768 最多放得下四项，俄语文案比中英都长
// 技能物品还没有页面，先不给 href，头部据此跳过渲染
// 玩家自己的页面指向 /my/*：菜单里拼不出 steamId，登录后由那一页转到 /profile/<id>/*
export const SITE_NAV_ITEMS = [
  { key: 'profile', shortLabelKey: 'profile', fullLabelKey: 'profileFull', href: '/my' },
  {
    key: 'property',
    shortLabelKey: 'property',
    fullLabelKey: 'propertyFull',
    href: '/my/property',
    desktopOnly: true,
  },
  {
    key: 'awaken',
    shortLabelKey: 'awaken',
    fullLabelKey: 'awakenFull',
    href: '/my/awaken',
    desktopOnly: true,
  },
  {
    key: 'dailyTask',
    shortLabelKey: 'dailyTask',
    fullLabelKey: 'dailyTaskFull',
    href: '/my/daily-task',
  },
  {
    key: 'membership',
    shortLabelKey: 'membershipShort',
    fullLabelKey: 'membership',
    href: '/membership',
  },
  {
    key: 'launch',
    shortLabelKey: 'launchShort',
    fullLabelKey: 'launch',
    href: '/launch',
    topFirst: true,
  },
  { key: 'wiki', shortLabelKey: 'wiki', fullLabelKey: 'wikiFull', href: null },
] as const;
