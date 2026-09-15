import { useLayoutEffect, useRef, useState } from 'react';

// 与名字行的 gap-1 一致
const BADGE_GAP = 4;
// scrollWidth 取整后可能少算不到 1px，宁可多换一行也不让名字出省略号
const ROUNDING_SLACK = 1;

/**
 * 卡片顶部名字与标签的排法：左右各让出一个标签宽度仍放得下名字时同一行、名字居中，否则标签换到第二行。
 * 按真实渲染宽度判断，窗口宽度与字体加载都会重算。
 */
export function useBadgeWrap<Row extends HTMLElement>(enabled: boolean) {
  const rowRef = useRef<Row>(null);
  const nameRef = useRef<HTMLSpanElement>(null);
  const badgeRef = useRef<HTMLSpanElement>(null);
  const [wrap, setWrap] = useState(false);

  useLayoutEffect(() => {
    const row = rowRef.current;
    const name = nameRef.current;
    const badge = badgeRef.current;
    if (!enabled || !row || !name || !badge) {
      return;
    }
    let active = true;
    const measure = () => {
      if (!active) {
        return;
      }
      // 名字的 scrollWidth 是不受排法影响的完整宽度，换行前后算出同一个结果，不会来回跳
      const needed =
        name.scrollWidth + ROUNDING_SLACK + 2 * (badge.getBoundingClientRect().width + BADGE_GAP);
      setWrap(needed > row.getBoundingClientRect().width);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    observer.observe(name);
    document.fonts.ready.then(measure);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [enabled]);

  return { rowRef, nameRef, badgeRef, wrap };
}
