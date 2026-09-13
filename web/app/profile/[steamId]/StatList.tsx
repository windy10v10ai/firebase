export type StatTone = 'season' | 'member';

export interface StatItem {
  label: string;
  value: string;
  tone?: StatTone;
}

const TONE_CLASS: Record<StatTone, string> = {
  season: 'text-season',
  member: 'text-member',
};

/** 成对的名称与数值，个人主页的几个区块共用。分栏与否看所在卡片的宽度，不看视口 */
export default function StatList({ items }: { items: StatItem[] }) {
  return (
    <dl className="grid gap-x-8 @sm:grid-cols-2">
      {items.map(({ label, value, tone }) => (
        <div
          key={label}
          className="flex items-baseline justify-between gap-4 border-b border-line py-2"
        >
          <dt className="text-muted">{label}</dt>
          <dd className={`font-medium tabular-nums ${tone ? TONE_CLASS[tone] : 'text-content'}`}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
