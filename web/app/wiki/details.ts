import type { AbilityDetail } from '@/config/awaken';
import type { WikiText } from '@/config/wiki';

export interface WikiDetail {
  desc: WikiText;
  ability: AbilityDetail;
}

/**
 * 提示框与弹窗要的说明数据单独成包，不随页面 HTML 下发：格子先出来，说明在浏览器里补上。
 * 打包出来的文件名带内容 hash，浏览器长期缓存，再次打开不用重新下载。
 */
export const DETAIL_LOADERS = {
  abilities: () =>
    import('@/config/wiki').then(
      ({ WIKI_ABILITIES }) =>
        new Map<string, WikiDetail>(
          WIKI_ABILITIES.map((entry) => [entry.name, { desc: entry.desc, ability: entry.ability }]),
        ),
    ),
};
