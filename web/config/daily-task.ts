import HERO_ASSETS from './daily-task-heroes.json';

/** 与 api 的 ROUNDS_PER_DAY 一致：每天 3 轮，一轮一条 */
export const ROUNDS_PER_DAY = 3;

/** 后端只留 30 条 */
export const HISTORY_DAY_LIMIT = 30;

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
