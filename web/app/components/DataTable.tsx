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
      w-full border border-gray-700 rounded-lg overflow-hidden bg-gray-900
      ${className}
    `}>
      <table className="w-full">
        <tbody>
          {items.map((item, index) => (
            <tr 
              key={index}
              className={`
                border-b border-gray-700 last:border-b-0
                ${index % 2 === 0 ? 'bg-gray-800/50' : 'bg-gray-900'}
              `}
            >
              <td className="py-4 px-6 w-1/3">
                <div className="font-medium text-gray-200">{item.title}</div>
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