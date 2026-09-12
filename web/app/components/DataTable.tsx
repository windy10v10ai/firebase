interface DataTableItem {
  title: string;
  content: string[];
}

interface DataTableProps {
  items: DataTableItem[];
  className?: string;
}

export default function DataTable({ items, className = '' }: DataTableProps) {
  return (
    <div className={`
      w-full border border-line rounded-lg overflow-hidden bg-surface
      ${className}
    `}>
      <table className="w-full">
        <tbody>
          {items.map((item, index) => (
            <tr 
              key={index}
              className={`
                border-b border-line last:border-b-0
                ${index % 2 === 0 ? 'bg-panel/50' : 'bg-surface'}
              `}
            >
              <td className="py-4 px-6 w-1/3">
                <div className="font-medium text-content">{item.title}</div>
              </td>
              <td className="py-4 px-6 w-2/3">
                <div className="space-y-2">
                  {item.content.map((text, i) => (
                    <p key={i} className="text-gray-300">{text}</p>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
} 