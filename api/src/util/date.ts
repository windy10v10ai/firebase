export function getUtcDayId(date = new Date()): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}
