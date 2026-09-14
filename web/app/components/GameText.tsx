import { Fragment, type ReactNode } from 'react';

/**
 * 渲染 game 本地化里的富文本。文案一个字都不改写，颜色也原样保留。
 *
 * 只认 <font color>、<b>、<br> 三种标记，解析成 React 节点。不走
 * dangerouslySetInnerHTML 加消毒：消毒是堵已知的洞，白名单解析是只放行已知的东西，
 * 后者没有注入面——这些文本来自 game 仓库，但渲染路径不该因为来源可信就放宽。
 */

// 只匹配白名单内的三种标签；其余尖括号原样当文本输出
const TAG = /<(\/?)(font|b|br)((?:\s+[a-zA-Z-]+='[^']*')*)\s*\/?>/g;
const COLOR = /color='(#[0-9a-fA-F]{3,8})'/;

interface Frame {
  children: ReactNode[];
  /** 闭合时用来包一层的元素；根层为 null */
  wrap: ((children: ReactNode[], key: number) => ReactNode) | null;
}

export function parseGameText(text: string): ReactNode[] {
  const root: Frame = { children: [], wrap: null };
  const stack: Frame[] = [root];
  let cursor = 0;
  let key = 0;

  const top = () => stack[stack.length - 1];
  const pushText = (value: string) => {
    if (value) top().children.push(value);
  };

  for (const match of text.matchAll(TAG)) {
    pushText(text.slice(cursor, match.index));
    cursor = match.index + match[0].length;

    const [, closing, tag, attrs] = match;

    if (tag === 'br') {
      top().children.push(<br key={key++} />);
      continue;
    }

    if (!closing) {
      if (tag === 'b') {
        stack.push({ children: [], wrap: (children, k) => <b key={k}>{children}</b> });
      } else {
        const color = attrs.match(COLOR)?.[1];
        stack.push({
          children: [],
          wrap: (children, k) => (
            <span key={k} style={color ? { color } : undefined}>
              {children}
            </span>
          ),
        });
      }
      continue;
    }

    // 闭合标签：没有对应开标签时忽略，不让一个笔误吃掉后面的内容
    if (stack.length > 1) {
      const frame = stack.pop() as Frame;
      top().children.push(frame.wrap!(frame.children, key++));
    }
  }

  pushText(text.slice(cursor));

  // 没闭合的标签照样把内容交出来，不丢字
  while (stack.length > 1) {
    const frame = stack.pop() as Frame;
    top().children.push(frame.wrap!(frame.children, key++));
  }
  return root.children;
}

interface GameTextProps {
  text: string;
  className?: string;
}

export default function GameText({ text, className }: GameTextProps) {
  const nodes = parseGameText(text);
  if (!className) {
    return <Fragment>{nodes}</Fragment>;
  }
  return <span className={className}>{nodes}</span>;
}
