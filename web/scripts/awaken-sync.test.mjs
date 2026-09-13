import assert from 'node:assert/strict';
import test from 'node:test';

import { check } from './awaken-sync.mjs';

/**
 * 七项自检的测试：每项都人为破坏一次输入，确认它真的会拦。
 * 自检是同步流程唯一的安全网，它自己不能坏。
 * 跑法：cd web && npm run awaken:test
 */

const hero = (over = {}) => ({
  heroName: 'npc_dota_hero_earthshaker',
  abilityName: 'special_bonus_unique_earthshaker_upgrade',
  freeTrial: true,
  freeTrialInTab: true,
  texture: 'earthshaker_aftershock',
  text: {
    zh: { heroName: '宇智波牛神', title: '余震 觉醒', desc: '余震命中的每个单位……' },
    en: { heroName: 'Earthshaker', title: 'Aftershock Awakened', desc: 'Each unit hit……' },
  },
  ...over,
});

/** 一份刚好能过全部七项的输入，每个用例在它基础上破坏一处 */
function healthy(count = 32) {
  const heroes = Array.from({ length: count }, (_, i) =>
    hero({ heroName: `npc_dota_hero_h${i}`, texture: `tex${i}` }),
  );
  return {
    source: {
      heroes,
      replacementHeroes: heroes.map((h) => h.heroName),
      freeTrialHeroes: heroes.map((h) => h.heroName),
      unresolved: [],
    },
    assets: {
      art: Object.fromEntries(heroes.map((h) => [h.heroName, `${h.heroName}.aaaaaaaa.webp`])),
      icons: Object.fromEntries(heroes.map((h) => [h.texture, `${h.texture}.bbbbbbbb.webp`])),
    },
  };
}

const errorsOf = ({ source, assets }) => check(source, assets).errors;

test('健康的输入不报错', () => {
  const { source, assets } = healthy();
  const { errors, warnings } = check(source, assets);
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
});

test('1 条目数低于下限时报错', () => {
  const input = healthy(5);
  assert.match(errorsOf(input).join('\n'), /少于下限/);
});

test('2 AwakenTab 与 awaken-config 的英雄对不上时报错', () => {
  const input = healthy();
  input.source.replacementHeroes = input.source.replacementHeroes.slice(1);
  assert.match(errorsOf(input).join('\n'), /英雄对不上/);
});

test('2 反向：config 里多一个英雄同样报错', () => {
  const input = healthy();
  input.source.replacementHeroes.push('npc_dota_hero_pudge');
  assert.match(errorsOf(input).join('\n'), /只在 config 里 \[npc_dota_hero_pudge\]/);
});

test('3 限免标记与 FREE_TRIAL_HEROES 对不上时报错', () => {
  const input = healthy();
  input.source.heroes[0].freeTrialInTab = false;
  assert.match(errorsOf(input).join('\n'), /限免标记.*对不上/);
});

test('4 缺中文描述时报错', () => {
  const input = healthy();
  input.source.heroes[0].text.zh.desc = '';
  assert.match(errorsOf(input).join('\n'), /缺 zh 描述/);
});

test('4 缺英文标题时报错', () => {
  const input = healthy();
  input.source.heroes[0].text.en.title = '';
  assert.match(errorsOf(input).join('\n'), /缺 en 标题/);
});

test('5 有占位符取不到值时报错', () => {
  const input = healthy();
  input.source.unresolved = ['techies_squees_scope 的 %attack_range_tooltip%'];
  assert.match(errorsOf(input).join('\n'), /占位符取不到值/);
});

test('6 缺英雄名时报错', () => {
  const input = healthy();
  input.source.heroes[0].text.zh.heroName = '';
  assert.match(errorsOf(input).join('\n'), /缺 zh 英雄名/);
});

test('7 缺立绘时报错', () => {
  const input = healthy();
  delete input.assets.art[input.source.heroes[0].heroName];
  assert.match(errorsOf(input).join('\n'), /没有立绘/);
});

test('7 缺图标只告警，不拦生成', () => {
  const { source, assets } = healthy();
  delete assets.icons[source.heroes[0].texture];
  const { errors, warnings } = check(source, assets);
  assert.deepEqual(errors, []);
  assert.match(warnings.join('\n'), /取不到，页面按缺图占位渲染/);
});
