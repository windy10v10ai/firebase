export interface StatItem {
  label: string;
  value: string;
}

/** 成对的名称与数值，个人主页的几个区块共用 */
export default function StatList({ items }: { items: StatItem[] }) {
  return (
    <dl className="grid gap-x-8 sm:grid-cols-2">
      {items.map(({ label, value }) => (
        <div
          key={label}
          className="flex items-baseline justify-between gap-4 border-b border-line py-2"
        >
          <dt className="text-muted">{label}</dt>
          <dd className="font-medium text-content tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
