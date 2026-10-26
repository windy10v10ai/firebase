interface LevelPoints {
  currentLevelPoint: number;
  nextLevelPoint: number;
}

/** 升级进度百分比与距下一级的差额；数据没到时为 0 */
export function levelProgress(values: LevelPoints | null): { progress: number; remaining: number } {
  if (!values) {
    return { progress: 0, remaining: 0 };
  }
  // 满级或数据异常时不强行显示负数进度
  const progress =
    values.nextLevelPoint > 0
      ? Math.min(100, Math.max(0, (values.currentLevelPoint / values.nextLevelPoint) * 100))
      : 100;
  return { progress, remaining: Math.max(0, values.nextLevelPoint - values.currentLevelPoint) };
}
