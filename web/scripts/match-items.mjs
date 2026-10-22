// 结算里的成装与功能装备保留说明，基础配件和配方只显示名字。
const EQUIPMENT = `
  ultimate_scepter aegis black_king_bar gem satanic travel_boots travel_boots_2
  harpoon octarine_core angels_demise heart wind_waker blink mjollnir greater_crit
  monkey_king_bar rapier refresher dagon dagon_2 dagon_3 dagon_4 dagon_5
  hurricane_pike gungir desolator lotus_orb silver_edge butterfly skadi devastator
  kaya mask_of_madness abyssal_blade overwhelming_blink lesser_crit sphere aeon_disk
  swift_blink arcane_blink vladmir shivas_guard invis_sword basher dragon_lance
  maelstrom blade_mail radiance disperser guardian_greaves assault sheepstick
  mage_slayer aether_lens manta nullifier yasha refresher_shard cheese witch_blade
  diffusal_blade phylactery meteor_hammer sange ghost ethereal_blade moon_shard
  crimson_guard echo_sabre pipe boots_of_bearing veil_of_discord tranquil_boots
  rod_of_atos revenants_brooch cyclone armlet soul_ring magic_stick magic_wand
  quelling_blade shadow_amulet orb_of_corrosion orchid vanguard spirit_vessel
  falcon_blade heavens_halberd mekansm ring_of_basilius royale_with_cheese
  force_staff glimmer_cape power_treads phase_boots arcane_boots bracer wraith_band
  null_talisman urn_of_shadows holy_locket hand_of_midas ancient_janggo pavise
  solar_crest medallion_of_courage bloodstone bloodthorn eternal_shroud
  sange_and_yasha kaya_and_sange yasha_and_kaya ultimate_scepter_2 aghanims_shard
`
  .trim()
  .split(/\s+/)
  .map((name) => `item_${name}`);

/** 中立名单覆盖当前掉落与仍有定义的旧物品，死亡退化物也能在结算中出现。 */
export function matchItems(kv, neutralText, wikiNames, assetNames) {
  const neutral = new Set(
    [...neutralText.replace(/\/\/[^\n]*/g, '').matchAll(/"(item_[a-z0-9_]+)"\s+"1"/g)].map(
      (match) => match[1],
    ),
  );
  for (const [name, item] of kv) {
    if (assetNames.has(name) && /^npc_items_override_neutral/.test(item.source)) neutral.add(name);
  }
  neutral.add('item_divine_regalia_broken');
  neutral.add('item_eldwurms_edda');
  const names = new Set([
    ...EQUIPMENT.filter((name) => kv.has(name) && assetNames.has(name)),
    ...neutral,
  ]);
  return [...names]
    .filter((name) => !wikiNames.has(name) && !name.startsWith('item_recipe_'))
    .sort()
    .map((name) => ({
      name,
      price: !neutral.has(name) && kv.get(name)?.cost > 0 ? kv.get(name).cost : null,
    }));
}
