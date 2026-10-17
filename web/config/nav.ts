// 站内项固定顺序：个人主页、属性、觉醒、会员、百科，见 docs/web/README.md「菜单」
// desktopOnly 的项在平板横排里让位：768 最多放得下四项，俄语文案比中英都长
// menuOnly 的项只进菜单，不上横排：横排的宽度留给常用入口
// section 是这一项覆盖的整段地址：入口只指向其中一页时，同段的其他页也算停在这一项上
// group 是这一项在菜单里的分组，同组的项在数组里相邻，菜单按数组顺序出组
// 玩家自己的页面指向 /my/*：菜单里拼不出 steamId，登录后由那一页转到 /profile/<id>/*
export const SITE_NAV_ITEMS = [
  {
    key: 'profile',
    shortLabelKey: 'profile',
    fullLabelKey: 'profileFull',
    href: '/my',
    group: 'mine',
  },
  {
    key: 'property',
    shortLabelKey: 'property',
    fullLabelKey: 'propertyFull',
    href: '/my/property',
    desktopOnly: true,
    group: 'mine',
  },
  {
    key: 'awaken',
    shortLabelKey: 'awaken',
    fullLabelKey: 'awakenFull',
    href: '/my/awaken',
    desktopOnly: true,
    group: 'mine',
  },
  {
    key: 'dailyTask',
    shortLabelKey: 'dailyTask',
    fullLabelKey: 'dailyTaskFull',
    href: '/my/daily-task',
    group: 'mine',
  },
  {
    key: 'membership',
    shortLabelKey: 'membershipShort',
    fullLabelKey: 'membership',
    href: '/membership',
    group: 'mine',
  },
  {
    key: 'launch',
    shortLabelKey: 'launchShort',
    fullLabelKey: 'launch',
    href: '/launch',
    group: 'game',
  },
  {
    key: 'wiki',
    shortLabelKey: 'wiki',
    fullLabelKey: 'wikiFull',
    href: '/wiki/abilities',
    section: '/wiki',
    desktopOnly: true,
    group: 'game',
  },
  {
    key: 'leaderboard',
    shortLabelKey: 'leaderboard',
    fullLabelKey: 'leaderboardFull',
    href: '/leaderboard',
    menuOnly: true,
    group: 'game',
  },
  {
    key: 'feedback',
    shortLabelKey: 'feedback',
    fullLabelKey: 'feedback',
    href: '/feedback',
    menuOnly: true,
    group: 'community',
  },
] as const;

// 外部链接排在「社区与帮助」组的末尾
export const NAV_MENU_GROUPS = ['mine', 'game', 'community'] as const;
