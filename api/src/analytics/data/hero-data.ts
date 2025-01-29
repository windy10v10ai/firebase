import { BadRequestException } from '@nestjs/common';

/**
 * Retrieves the ID of a hero based on the provided hero name.
 *
 *
 * @param heroName - The name of the hero whose ID is to be retrieved.
 * @returns The ID of the hero.
 * @throws Will throw an 401 error if the hero name is not found in the map.
 */
export function GetHeroId(heroName: string): number {
  const heroId = heroNameToIdMap.get(heroName);
  if (heroId === undefined) {
    throw new BadRequestException(`[GetHeroId] Invalid hero name: ${heroName}`);
  }
  return heroId;
}

export function GetHeroNameChinese(heroName: string): string {
  const heroNameChinese = heroNameToChineseMap.get(heroName);
  if (heroNameChinese === undefined) {
    throw new BadRequestException(`[GetHeroNameChinese] Invalid hero name: ${heroName}`);
  }
  return heroNameChinese;
}

// Hero name to ID map.
// https://docs.google.com/spreadsheets/d/1lwE0QvAYkOmVQoEdpBg2y2Wrb2Ox5NauvvM6lGU7jFo/edit?gid=2041075161#gid=2041075161
const heroNameToIdMap = new Map<string, number>([
  ['npc_dota_hero_abaddon', 1],
  ['npc_dota_hero_alchemist', 2],
  ['npc_dota_hero_ancient_apparition', 3],
  ['npc_dota_hero_antimage', 4],
  ['npc_dota_hero_arc_warden', 5],
  ['npc_dota_hero_axe', 6],
  ['npc_dota_hero_bane', 7],
  ['npc_dota_hero_batrider', 8],
  ['npc_dota_hero_beastmaster', 9],
  ['npc_dota_hero_bloodseeker', 10],
  ['npc_dota_hero_bounty_hunter', 11],
  ['npc_dota_hero_brewmaster', 12],
  ['npc_dota_hero_bristleback', 13],
  ['npc_dota_hero_broodmother', 14],
  ['npc_dota_hero_centaur', 15],
  ['npc_dota_hero_chaos_knight', 16],
  ['npc_dota_hero_chen', 17],
  ['npc_dota_hero_clinkz', 18],
  ['npc_dota_hero_rattletrap', 19],
  ['npc_dota_hero_crystal_maiden', 20],
  ['npc_dota_hero_dark_seer', 21],
  ['npc_dota_hero_dazzle', 22],
  ['npc_dota_hero_dark_willow', 23],
  ['npc_dota_hero_death_prophet', 24],
  ['npc_dota_hero_disruptor', 25],
  ['npc_dota_hero_doom_bringer', 26],
  ['npc_dota_hero_dragon_knight', 27],
  ['npc_dota_hero_drow_ranger', 28],
  ['npc_dota_hero_earth_spirit', 29],
  ['npc_dota_hero_earthshaker', 30],
  ['npc_dota_hero_elder_titan', 31],
  ['npc_dota_hero_ember_spirit', 32],
  ['npc_dota_hero_enchantress', 33],
  ['npc_dota_hero_enigma', 34],
  ['npc_dota_hero_faceless_void', 35],
  ['npc_dota_hero_grimstroke', 36],
  ['npc_dota_hero_gyrocopter', 37],
  ['npc_dota_hero_huskar', 38],
  ['npc_dota_hero_invoker', 39],
  ['npc_dota_hero_wisp', 40],
  ['npc_dota_hero_jakiro', 41],
  ['npc_dota_hero_juggernaut', 42],
  ['npc_dota_hero_keeper_of_the_light', 43],
  ['npc_dota_hero_kunkka', 44],
  ['npc_dota_hero_legion_commander', 45],
  ['npc_dota_hero_leshrac', 46],
  ['npc_dota_hero_lich', 47],
  ['npc_dota_hero_life_stealer', 48],
  ['npc_dota_hero_lina', 49],
  ['npc_dota_hero_lion', 50],
  ['npc_dota_hero_lone_druid', 51],
  ['npc_dota_hero_luna', 52],
  ['npc_dota_hero_lycan', 53],
  ['npc_dota_hero_magnataur', 54],
  ['npc_dota_hero_mars', 55],
  ['npc_dota_hero_medusa', 56],
  ['npc_dota_hero_meepo', 57],
  ['npc_dota_hero_mirana', 58],
  ['npc_dota_hero_morphling', 59],
  ['npc_dota_hero_monkey_king', 60],
  ['npc_dota_hero_naga_siren', 61],
  ['npc_dota_hero_furion', 62],
  ['npc_dota_hero_necrolyte', 63],
  ['npc_dota_hero_night_stalker', 64],
  ['npc_dota_hero_nyx_assassin', 65],
  ['npc_dota_hero_ogre_magi', 66],
  ['npc_dota_hero_omniknight', 67],
  ['npc_dota_hero_oracle', 68],
  ['npc_dota_hero_obsidian_destroyer', 69],
  ['npc_dota_hero_pangolier', 70],
  ['npc_dota_hero_phantom_assassin', 71],
  ['npc_dota_hero_phantom_lancer', 72],
  ['npc_dota_hero_phoenix', 73],
  ['npc_dota_hero_puck', 74],
  ['npc_dota_hero_pudge', 75],
  ['npc_dota_hero_pugna', 76],
  ['npc_dota_hero_queenofpain', 77],
  ['npc_dota_hero_razor', 78],
  ['npc_dota_hero_riki', 79],
  ['npc_dota_hero_rubick', 80],
  ['npc_dota_hero_sand_king', 81],
  ['npc_dota_hero_shadow_demon', 82],
  ['npc_dota_hero_nevermore', 83],
  ['npc_dota_hero_shadow_shaman', 84],
  ['npc_dota_hero_silencer', 85],
  ['npc_dota_hero_skywrath_mage', 86],
  ['npc_dota_hero_slardar', 87],
  ['npc_dota_hero_slark', 88],
  ['npc_dota_hero_snapfire', 89],
  ['npc_dota_hero_sniper', 90],
  ['npc_dota_hero_spectre', 91],
  ['npc_dota_hero_spirit_breaker', 92],
  ['npc_dota_hero_storm_spirit', 93],
  ['npc_dota_hero_sven', 94],
  ['npc_dota_hero_techies', 95],
  ['npc_dota_hero_templar_assassin', 96],
  ['npc_dota_hero_terrorblade', 97],
  ['npc_dota_hero_tidehunter', 98],
  ['npc_dota_hero_shredder', 99],
  ['npc_dota_hero_tinker', 100],
  ['npc_dota_hero_tiny', 101],
  ['npc_dota_hero_treant', 102],
  ['npc_dota_hero_troll_warlord', 103],
  ['npc_dota_hero_tusk', 104],
  ['npc_dota_hero_abyssal_underlord', 105],
  ['npc_dota_hero_undying', 106],
  ['npc_dota_hero_ursa', 107],
  ['npc_dota_hero_vengefulspirit', 108],
  ['npc_dota_hero_venomancer', 109],
  ['npc_dota_hero_viper', 110],
  ['npc_dota_hero_visage', 111],
  ['npc_dota_hero_void_spirit', 112],
  ['npc_dota_hero_warlock', 113],
  ['npc_dota_hero_weaver', 114],
  ['npc_dota_hero_windrunner', 115],
  ['npc_dota_hero_winter_wyvern', 116],
  ['npc_dota_hero_witch_doctor', 117],
  ['npc_dota_hero_skeleton_king', 118],
  ['npc_dota_hero_zuus', 119],
  ['npc_dota_hero_hoodwink', 120],
  ['npc_dota_hero_dawnbreaker', 121],
  ['npc_dota_hero_marci', 122],
  ['npc_dota_hero_primal_beast', 123],
  ['npc_dota_hero_muerta', 124],
  ['npc_dota_hero_ringmaster', 125],
  ['npc_dota_hero_kez', 126],
]);

const heroNameToChineseMap = new Map<string, string>([
  ['npc_dota_hero_abaddon', '亚巴顿'],
  ['npc_dota_hero_alchemist', '炼金术士'],
  ['npc_dota_hero_ancient_apparition', '远古冰魄'],
  ['npc_dota_hero_antimage', '敌法师'],
  ['npc_dota_hero_arc_warden', '天穹守望者'],
  ['npc_dota_hero_axe', '斧王'],
  ['npc_dota_hero_bane', '祸乱之源'],
  ['npc_dota_hero_batrider', '蝙蝠骑士'],
  ['npc_dota_hero_beastmaster', '兽王'],
  ['npc_dota_hero_bloodseeker', '血魔'],
  ['npc_dota_hero_bounty_hunter', '赏金猎人'],
  ['npc_dota_hero_brewmaster', '杰克'],
  ['npc_dota_hero_bristleback', '钢背兽'],
  ['npc_dota_hero_broodmother', 'Saber'],
  ['npc_dota_hero_centaur', '半人马战行者'],
  ['npc_dota_hero_chaos_knight', '混沌骑士'],
  ['npc_dota_hero_chen', '孙悟空'],
  ['npc_dota_hero_clinkz', '克林克兹'],
  ['npc_dota_hero_rattletrap', '发条技师'],
  ['npc_dota_hero_crystal_maiden', '水晶室女'],
  ['npc_dota_hero_dark_seer', '执剑泰斗'],
  ['npc_dota_hero_dazzle', '戴泽'],
  ['npc_dota_hero_dark_willow', '邪影芳灵'],
  ['npc_dota_hero_death_prophet', '死亡先知'],
  ['npc_dota_hero_disruptor', '干扰者'],
  ['npc_dota_hero_doom_bringer', '末日使者'],
  ['npc_dota_hero_dragon_knight', '龙骑士'],
  ['npc_dota_hero_drow_ranger', '卓尔游侠'],
  ['npc_dota_hero_earth_spirit', '大地之灵'],
  ['npc_dota_hero_earthshaker', '撼地者'],
  ['npc_dota_hero_elder_titan', '上古巨神'],
  ['npc_dota_hero_ember_spirit', '灰烬之灵'],
  ['npc_dota_hero_enchantress', '魅惑魔女'],
  ['npc_dota_hero_enigma', '谜团'],
  ['npc_dota_hero_faceless_void', '虚空假面'],
  ['npc_dota_hero_grimstroke', '天涯墨客'],
  ['npc_dota_hero_gyrocopter', '矮人直升机'],
  ['npc_dota_hero_huskar', '哈斯卡'],
  ['npc_dota_hero_invoker', '祈求者'],
  ['npc_dota_hero_wisp', '艾欧'],
  ['npc_dota_hero_jakiro', '杰奇洛'],
  ['npc_dota_hero_juggernaut', '主宰'],
  ['npc_dota_hero_keeper_of_the_light', '光之守卫'],
  ['npc_dota_hero_kunkka', '昆卡'],
  ['npc_dota_hero_legion_commander', '军团指挥官'],
  ['npc_dota_hero_leshrac', '拉席克'],
  ['npc_dota_hero_lich', '巫妖'],
  ['npc_dota_hero_life_stealer', '噬魂鬼'],
  ['npc_dota_hero_lina', '莉娜'],
  ['npc_dota_hero_lion', '莱恩'],
  ['npc_dota_hero_lone_druid', '德鲁伊'],
  ['npc_dota_hero_luna', '露娜'],
  ['npc_dota_hero_lycan', '狼人'],
  ['npc_dota_hero_magnataur', '马格纳斯'],
  ['npc_dota_hero_mars', '玛尔斯'],
  ['npc_dota_hero_medusa', '美杜莎'],
  ['npc_dota_hero_meepo', '初音未来'],
  ['npc_dota_hero_mirana', '米拉娜'],
  ['npc_dota_hero_morphling', '变体精灵'],
  ['npc_dota_hero_monkey_king', '齐天大圣'],
  ['npc_dota_hero_naga_siren', '娜迦海妖'],
  ['npc_dota_hero_furion', '自然先知'],
  ['npc_dota_hero_necrolyte', '死灵法师'],
  ['npc_dota_hero_night_stalker', '暗夜魔王'],
  ['npc_dota_hero_nyx_assassin', '司夜刺客'],
  ['npc_dota_hero_ogre_magi', '食人魔魔法师'],
  ['npc_dota_hero_omniknight', '全能骑士'],
  ['npc_dota_hero_oracle', '神谕者'],
  ['npc_dota_hero_obsidian_destroyer', '殁境神蚀者'],
  ['npc_dota_hero_pangolier', '石鳞剑士'],
  ['npc_dota_hero_phantom_assassin', '幻影刺客'],
  ['npc_dota_hero_phantom_lancer', '八云紫'],
  ['npc_dota_hero_phoenix', '凤凰'],
  ['npc_dota_hero_puck', '帕克'],
  ['npc_dota_hero_pudge', '帕吉'],
  ['npc_dota_hero_pugna', '帕格纳'],
  ['npc_dota_hero_queenofpain', '痛苦女王'],
  ['npc_dota_hero_razor', '雷泽'],
  ['npc_dota_hero_riki', '力丸'],
  ['npc_dota_hero_rubick', '拉比克'],
  ['npc_dota_hero_sand_king', '沙王'],
  ['npc_dota_hero_shadow_demon', '暗影恶魔'],
  ['npc_dota_hero_nevermore', '影魔'],
  ['npc_dota_hero_shadow_shaman', '暗影萨满'],
  ['npc_dota_hero_silencer', '沉默术士'],
  ['npc_dota_hero_skywrath_mage', '天怒法师'],
  ['npc_dota_hero_slardar', '斯拉达'],
  ['npc_dota_hero_slark', '斯拉克'],
  ['npc_dota_hero_snapfire', '电炎绝手'],
  ['npc_dota_hero_sniper', '狙击手'],
  ['npc_dota_hero_spectre', '幽鬼'],
  ['npc_dota_hero_spirit_breaker', '裂魂人'],
  ['npc_dota_hero_storm_spirit', '风暴之灵'],
  ['npc_dota_hero_sven', '斯温'],
  ['npc_dota_hero_techies', '工程师'],
  ['npc_dota_hero_templar_assassin', '圣堂刺客'],
  ['npc_dota_hero_terrorblade', '恐怖利刃'],
  ['npc_dota_hero_tidehunter', '潮汐猎人'],
  ['npc_dota_hero_shredder', '伐木机'],
  ['npc_dota_hero_tinker', '修补匠'],
  ['npc_dota_hero_tiny', '小小'],
  ['npc_dota_hero_treant', '树精卫士'],
  ['npc_dota_hero_troll_warlord', '巨魔战将'],
  ['npc_dota_hero_tusk', '巨牙海民'],
  ['npc_dota_hero_abyssal_underlord', '孽主'],
  ['npc_dota_hero_undying', '不朽尸王'],
  ['npc_dota_hero_ursa', '熊战士'],
  ['npc_dota_hero_vengefulspirit', '复仇之魂'],
  ['npc_dota_hero_venomancer', '剧毒术士'],
  ['npc_dota_hero_viper', '冥界亚龙'],
  ['npc_dota_hero_visage', '维萨吉'],
  ['npc_dota_hero_void_spirit', '虚无之灵'],
  ['npc_dota_hero_warlock', '术士'],
  ['npc_dota_hero_weaver', '编织者'],
  ['npc_dota_hero_windrunner', '风行者'],
  ['npc_dota_hero_winter_wyvern', '寒冬飞龙'],
  ['npc_dota_hero_witch_doctor', '巫医'],
  ['npc_dota_hero_skeleton_king', '骷髅王'],
  ['npc_dota_hero_zuus', '宙斯'],
  ['npc_dota_hero_hoodwink', '森海飞霞'],
  ['npc_dota_hero_dawnbreaker', '破晓辰星'],
  ['npc_dota_hero_marci', '玛西'],
  ['npc_dota_hero_primal_beast', '獸'],
  ['npc_dota_hero_muerta', '琼英碧灵'],
  ['npc_dota_hero_ringmaster', '百戏大王'],
  ['npc_dota_hero_kez', '凯'],
]);
