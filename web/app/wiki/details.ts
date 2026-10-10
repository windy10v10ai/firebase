import type { AbilityDetail } from '@/config/awaken';
import type { WikiEntryData, WikiText } from '@/config/wiki';

export interface WikiDetail {
  desc: WikiText;
  ability: AbilityDetail;
}

const toMap = (entries: WikiEntryData[]) =>
  new Map<string, WikiDetail>(
    entries.map((entry) => [entry.name, { desc: entry.desc, ability: entry.ability }]),
  );

/**
 * 提示框与弹窗要的说明数据单独成包，不随页面 HTML 下发：格子先出来，说明在浏览器里补上。
 * 直接引 JSON 而不经 config/wiki.ts，技能页与物品页各打各的包；文件名带内容 hash，浏览器长期缓存。
 */
export const DETAIL_LOADERS = {
  abilities: () =>
    import('@/config/wiki-abilities.json').then((data) => toMap(data.abilities as WikiEntryData[])),
  items: () =>
    import('@/config/wiki-items.json').then((data) => toMap(data.items as WikiEntryData[])),
};
