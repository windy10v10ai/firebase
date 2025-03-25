export default function DisclosurePage() {
  return (
    <div className="space-y-8">
      <section>
        <h1 className="title-primary mb-6">商业披露</h1>
        <div className="space-y-6">
          <div>
            <h2 className="title-secondary mb-4">关于我们</h2>
            <p className="text-content">
              我们是一个独立的DOTA2地图制作团队，主要从事DOTA2自定义游戏的开发。
            </p>
          </div>

          <div>
            <h2 className="title-secondary mb-4">商品和服务</h2>
            <p className="text-content">
              我们提供的所有商品均为数字商品，包括但不限于游戏内容、订阅服务等。
            </p>
          </div>

          <div>
            <h2 className="title-secondary mb-4">退款政策</h2>
            <ul className="list-disc pl-5 space-y-2 text-content">
              <li>未激活的数字商品可在购买后7天内申请退款</li>
              <li>已使用或下载的商品不予退款</li>
              <li>特殊情况将根据具体情况进行处理</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  )
} 