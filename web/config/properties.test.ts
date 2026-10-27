import { describe, expect, it } from 'vitest';

import { PROPERTY_LIST, stepsForCell, type PropertyDef } from './properties';

const find = (levelPerStep: number): PropertyDef => {
  const def = PROPERTY_LIST.find((item) => item.levelPerStep === levelPerStep);
  if (!def) {
    throw new Error(`no property with levelPerStep ${levelPerStep}`);
  }
  return def;
};

describe('stepsForCell', () => {
  const normal = find(1);
  const skill = find(2);
  const oneShot = find(8);

  it('点第 N 格暂存到第 N 级所需的档数', () => {
    expect(stepsForCell(normal, 3, 0, 8, 10)).toBe(5);
    expect(stepsForCell(normal, 0, 0, 1, 10)).toBe(1);
  });

  it('再点已选中的那一格取消选择', () => {
    expect(stepsForCell(normal, 3, 5, 8, 10)).toBe(0);
  });

  it('换一格重选时按总目标重算，不在已暂存的基础上叠加', () => {
    expect(stepsForCell(normal, 3, 2, 7, 8)).toBe(4);
  });

  it('点数不够时停在能负担的最高一格', () => {
    expect(stepsForCell(normal, 3, 0, 8, 2)).toBe(2);
    expect(stepsForCell(normal, 3, 2, 8, 0)).toBe(2);
    expect(stepsForCell(normal, 3, 0, 8, 0)).toBe(0);
  });

  it('额外技能点一格两级、每档 2 点', () => {
    expect(stepsForCell(skill, 2, 0, 4, 10)).toBe(3);
    expect(stepsForCell(skill, 0, 0, 3, 5)).toBe(2);
  });

  it('一次激活的属性点整段等于在选中与取消之间切换', () => {
    expect(stepsForCell(oneShot, 0, 0, 8, 8)).toBe(1);
    expect(stepsForCell(oneShot, 0, 1, 8, 0)).toBe(0);
    expect(stepsForCell(oneShot, 0, 0, 8, 7)).toBe(0);
  });
});
