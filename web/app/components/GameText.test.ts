import { isValidElement, type ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import { parseGameText } from './GameText';

describe('parseGameText', () => {
  it('把 <h1> 段标题渲染成独占一行的粗体', () => {
    const [heading, rest] = parseGameText('<h1>主动：砍伐</h1>砍伐一根指定树木。');
    expect(isValidElement(heading)).toBe(true);
    const element = heading as ReactElement<{ className: string; children: unknown[] }>;
    expect(element.props.className).toContain('block');
    expect(element.props.children).toEqual(['主动：砍伐']);
    expect(rest).toBe('砍伐一根指定树木。');
  });

  it('白名单外的标签原样当文本', () => {
    expect(parseGameText('<h2>x</h2>')).toEqual(['<h2>x</h2>']);
  });
});
