/**
 * 大数缩写，与游戏内同一套写法：中文万/亿、英文 K/M，保留约 3 位有效数字并去尾零。
 * 两边不一致时玩家会以为是两个不同的目标值。
 */
export function formatStatNumber(value: number, isChinese: boolean): string {
  if (!Number.isFinite(value) || value < 0) {
    return '0';
  }
  if (value < 10000) {
    return addThousandsSeparators(String(value));
  }

  const unit = isChinese
    ? value >= 1e8
      ? { divisor: 1e8, suffix: '亿' }
      : { divisor: 1e4, suffix: '万' }
    : value >= 1e6
      ? { divisor: 1e6, suffix: 'M' }
      : { divisor: 1e3, suffix: 'K' };

  return addThousandsSeparators(trimToThreeSignificant(value / unit.divisor)) + unit.suffix;
}

function trimToThreeSignificant(n: number): string {
  const intDigits = Math.floor(n).toString().length;
  const decimals = Math.max(0, 3 - intDigits);
  // parseFloat 去尾零且不误伤整数尾零：10.0 → 10、1.20 → 1.2、123 → 123
  return parseFloat(n.toFixed(decimals)).toString();
}

function addThousandsSeparators(text: string): string {
  const [integer, decimal] = text.split('.');
  if (integer.length <= 4) {
    return text;
  }
  const separated = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decimal != null ? `${separated}.${decimal}` : separated;
}
