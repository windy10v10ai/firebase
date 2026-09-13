import {
  Activity,
  Anvil,
  Brain,
  CirclePlus,
  Crosshair,
  Droplet,
  Dumbbell,
  Eye,
  Feather,
  Flame,
  Footprints,
  Gauge,
  Heart,
  HeartPulse,
  Rabbit,
  Radar,
  Ruler,
  Scan,
  Shield,
  ShieldPlus,
  Snowflake,
  Sparkles,
  Sword,
  Timer,
  Wind,
  Zap,
  type LucideIcon,
} from 'lucide-react';

/**
 * 属性表照抄游戏，改游戏数值时这里要一起改：
 * game/content/panorama/scripts/custom_game/battlepass.js 的 Player_Property_List（名称、数值、消耗）
 * game/src/vscripts/modules/property/property_controller.ts 的 limitPropertyNames（生效方式）
 */

/** 所有属性的最高等级 */
export const PROPERTY_MAX_LEVEL = 8;

/**
 * 属性在游戏里生效的方式：
 * instant 英雄 1 级就拿到全部数值，scaling 英雄每 2 级解锁 1 级，skill 额外技能点每 4 级 1 个
 */
export type PropertyGroup = 'instant' | 'scaling' | 'skill';

/** 分组在页面上的顺序 */
export const PROPERTY_GROUPS: PropertyGroup[] = ['instant', 'scaling', 'skill'];

/** 每升 1 级需要的英雄等级，乘上属性等级就是「英雄几级全部生效」 */
const HERO_LEVEL_PER_STEP: Record<PropertyGroup, number> = {
  instant: 0,
  scaling: 2,
  skill: 4,
};

export interface PropertyDef {
  /** 接口收发用的属性名 */
  name: string;
  group: PropertyGroup;
  valuePerLevel: number;
  /** 按一次 + 升几级，也就是消耗几点属性点：多数属性 1，额外技能点 2，一次升满的四条 8 */
  levelPerStep: number;
  /**
   * 进度条画几格。多数属性一格一级；额外技能点两级换一个技能点，按技能点数画四格；
   * 一次升满的四条仍画八格，好让它和别的属性看起来是一排，不是另一种东西。
   */
  barCells: number;
  unit?: string;
  /** 数值前面带 +，纯增益的属性用它，百分比类不用 */
  signed?: boolean;
  Icon: LucideIcon;
}

export const PROPERTY_LIST: PropertyDef[] = [
  { name: 'property_cooldown_percentage', group: 'instant', valuePerLevel: 4, levelPerStep: 1, barCells: 8, unit: '%', Icon: Timer },
  { name: 'property_movespeed_bonus_constant', group: 'instant', valuePerLevel: 25, levelPerStep: 1, barCells: 8, signed: true, Icon: Wind },
  { name: 'property_bonus_vision', group: 'instant', valuePerLevel: 50, levelPerStep: 1, barCells: 8, signed: true, Icon: Eye },
  { name: 'property_aoe_bonus_constant_stacking', group: 'instant', valuePerLevel: 15, levelPerStep: 1, barCells: 8, signed: true, Icon: Scan },
  { name: 'property_health_regen_percentage', group: 'instant', valuePerLevel: 0.3, levelPerStep: 1, barCells: 8, unit: '%', Icon: Heart },
  { name: 'property_mana_regen_total_percentage', group: 'instant', valuePerLevel: 0.3, levelPerStep: 1, barCells: 8, unit: '%', Icon: Droplet },
  { name: 'property_ignore_movespeed_limit', group: 'instant', valuePerLevel: 0.125, levelPerStep: 8, barCells: 8, Icon: Gauge },
  { name: 'property_cannot_miss', group: 'instant', valuePerLevel: 0.125, levelPerStep: 8, barCells: 8, Icon: Crosshair },
  { name: 'property_flying', group: 'instant', valuePerLevel: 0.125, levelPerStep: 8, barCells: 8, Icon: Feather },
  { name: 'property_slow_immune', group: 'instant', valuePerLevel: 0.125, levelPerStep: 8, barCells: 8, Icon: Snowflake },

  { name: 'property_cast_range_bonus_stacking', group: 'scaling', valuePerLevel: 25, levelPerStep: 1, barCells: 8, signed: true, Icon: Radar },
  { name: 'property_spell_amplify_percentage', group: 'scaling', valuePerLevel: 5, levelPerStep: 1, barCells: 8, unit: '%', Icon: Sparkles },
  { name: 'property_status_resistance_stacking', group: 'scaling', valuePerLevel: 4, levelPerStep: 1, barCells: 8, unit: '%', Icon: Activity },
  { name: 'property_evasion_constant', group: 'scaling', valuePerLevel: 4, levelPerStep: 1, barCells: 8, unit: '%', Icon: Rabbit },
  { name: 'property_magical_resistance_bonus', group: 'scaling', valuePerLevel: 4, levelPerStep: 1, barCells: 8, unit: '%', Icon: ShieldPlus },
  { name: 'property_incoming_damage_percentage', group: 'scaling', valuePerLevel: 4, levelPerStep: 1, barCells: 8, unit: '%', Icon: Shield },
  { name: 'property_attack_range_bonus', group: 'scaling', valuePerLevel: 25, levelPerStep: 1, barCells: 8, signed: true, Icon: Ruler },
  { name: 'property_physical_armor_bonus', group: 'scaling', valuePerLevel: 5, levelPerStep: 1, barCells: 8, signed: true, Icon: Anvil },
  { name: 'property_preattack_bonus_damage', group: 'scaling', valuePerLevel: 15, levelPerStep: 1, barCells: 8, signed: true, Icon: Sword },
  { name: 'property_attackspeed_bonus_constant', group: 'scaling', valuePerLevel: 15, levelPerStep: 1, barCells: 8, signed: true, Icon: Zap },
  { name: 'property_stats_strength_bonus', group: 'scaling', valuePerLevel: 10, levelPerStep: 1, barCells: 8, signed: true, Icon: Dumbbell },
  { name: 'property_stats_agility_bonus', group: 'scaling', valuePerLevel: 10, levelPerStep: 1, barCells: 8, signed: true, Icon: Footprints },
  { name: 'property_stats_intellect_bonus', group: 'scaling', valuePerLevel: 15, levelPerStep: 1, barCells: 8, signed: true, Icon: Brain },
  { name: 'property_lifesteal', group: 'scaling', valuePerLevel: 10, levelPerStep: 1, barCells: 8, unit: '%', Icon: HeartPulse },
  { name: 'property_spell_lifesteal', group: 'scaling', valuePerLevel: 8, levelPerStep: 1, barCells: 8, unit: '%', Icon: Flame },

  { name: 'property_skill_points_bonus', group: 'skill', valuePerLevel: 0.5, levelPerStep: 2, barCells: 4, signed: true, Icon: CirclePlus },
];

/** 一次就升到满级的四条，没有中间档位，界面上只显示获取与否 */
export function isOneShot(def: PropertyDef): boolean {
  return def.levelPerStep === PROPERTY_MAX_LEVEL;
}

/** 属性等级换算成进度条上的格数 */
export function cellsFilled(def: PropertyDef, level: number): number {
  return Math.round((level * def.barCells) / PROPERTY_MAX_LEVEL);
}

/** 进度条上一格对应几级 */
export function levelsPerCell(def: PropertyDef): number {
  return PROPERTY_MAX_LEVEL / def.barCells;
}

/** 升一格加多少数值 */
export function valuePerCell(def: PropertyDef): string {
  return formatPropertyValue(def, levelsPerCell(def));
}

/**
 * 属性等级对应的数值文案。
 * 小数只留一位，否则 0.3 每级乘出来会是 0.8999999999999999。
 */
export function formatPropertyValue(def: PropertyDef, level: number): string {
  const raw = def.valuePerLevel * level;
  const value = Number.isInteger(raw) ? String(raw) : raw.toFixed(1);
  return `${def.signed ? '+' : ''}${value}${def.unit ?? ''}`;
}

/** 进度条第 n 格要英雄多少级才生效，instant 的属性恒为 1 */
export function heroLevelForCell(def: PropertyDef, cell: number): number {
  const per = HERO_LEVEL_PER_STEP[def.group];
  return per === 0 ? 1 : cell * per;
}
