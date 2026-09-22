import HERO_ASSETS from './heroes.json';

interface HeroAsset {
  /** public/heroes/ 下的小地图头像文件名，带内容 hash；null 表示没取到 */
  icon: string | null;
  zh: string;
  en: string;
}

const HEROES = HERO_ASSETS as Record<string, HeroAsset | undefined>;

export function heroAsset(heroName: string): HeroAsset | undefined {
  return HEROES[heroName];
}

export function heroIconPath(icon: string): string {
  return `/heroes/${icon}`;
}

/** 清单只有中英两份，其余语言落英文；查不到的退回内部名去掉前缀，好过显示空白 */
export function heroLabel(heroName: string, locale: string): string {
  const hero = heroAsset(heroName);
  if (!hero) {
    return heroName.replace('npc_dota_hero_', '');
  }
  return locale === 'zh' ? hero.zh : hero.en;
}
