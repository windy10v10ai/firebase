interface DataTableItem {
  title: string;
  content: string[];
}

interface DataTableProps {
  items: DataTableItem[];
  className?: string;
}

function ItemContent({ content }: { content: string[] }) {
  return (
    <div className="space-y-2">
      {content.map((text) => (
        <p key={text} className="text-content">
          {text}
        </p>
      ))}
    </div>
  );
}

export default function DataTable({ items, className = '' }: DataTableProps) {
  return (
    <div className={`w-full overflow-hidden rounded-[10px] border border-line bg-panel ${className}`}>
      <table className="hidden w-full sm:table">
        <tbody>
          {items.map((item, index) => (
            <tr
              key={item.title}
              className={`border-b border-line last:border-b-0 ${
                index % 2 === 0 ? 'bg-panel' : 'bg-panel-soft'
              }`}
            >
              <td className="w-1/3 px-6 py-4 align-top">
                <div className="font-medium text-heading">{item.title}</div>
              </td>
              <td className="w-2/3 px-6 py-4">
                <ItemContent content={item.content} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="divide-y divide-line sm:hidden">
        {items.map((item, index) => (
          <div key={item.title} className={index % 2 === 0 ? 'bg-panel' : 'bg-panel-soft'}>
            <dt className="px-4 pt-4 font-medium text-heading">{item.title}</dt>
            <dd className="px-4 pb-4 pt-2">
              <ItemContent content={item.content} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
