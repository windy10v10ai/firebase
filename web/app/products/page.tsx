export default function ProductsPage() {
  return (
    <div className="space-y-8">
      {/* 页面标题 */}
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-4">所有商品</h1>
        <p className="text-gray-600">浏览我们的数字商品集合</p>
      </div>

      {/* 商品筛选区域 */}
      <div className="flex justify-between items-center">
        <div className="flex space-x-4">
          <select className="border rounded px-3 py-2">
            <option value="">所有分类</option>
            <option value="software">软件</option>
            <option value="ebook">电子书</option>
            <option value="course">课程</option>
          </select>
          <select className="border rounded px-3 py-2">
            <option value="">价格排序</option>
            <option value="asc">从低到高</option>
            <option value="desc">从高到低</option>
          </select>
        </div>
        <div className="relative">
          <input
            type="text"
            placeholder="搜索商品..."
            className="border rounded px-3 py-2 pl-10"
          />
        </div>
      </div>

      {/* 商品列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* 商品卡片将在这里动态生成 */}
      </div>

      {/* 分页 */}
      <div className="flex justify-center space-x-2">
        <button className="px-4 py-2 border rounded hover:bg-gray-50">上一页</button>
        <button className="px-4 py-2 border rounded bg-blue-500 text-white">1</button>
        <button className="px-4 py-2 border rounded hover:bg-gray-50">2</button>
        <button className="px-4 py-2 border rounded hover:bg-gray-50">3</button>
        <button className="px-4 py-2 border rounded hover:bg-gray-50">下一页</button>
      </div>
    </div>
  )
} 