export default function DisclosurePage() {
  return (
    <div className="max-w-3xl mx-auto prose lg:prose-xl">
      <h1>商业披露</h1>
      
      {/* 公司信息 */}
      <section>
        <h2>公司信息</h2>
        <p>公司名称：</p>
        <p>注册地址：</p>
        <p>联系方式：</p>
      </section>

      {/* 商品说明 */}
      <section>
        <h2>商品说明</h2>
        <p>我们提供的所有数字商品包括：</p>
        <ul>
          <li>软件许可证</li>
          <li>电子书</li>
          <li>在线课程</li>
          <li>其他数字内容</li>
        </ul>
      </section>

      {/* 价格和支付 */}
      <section>
        <h2>价格和支付</h2>
        <p>所有价格均以日元（JPY）显示，包含适用的税费。</p>
        <p>我们使用Stripe作为支付处理商，确保交易安全。</p>
      </section>

      {/* 退款政策 */}
      <section>
        <h2>退款政策</h2>
        <p>由于数字商品的特殊性，我们的退款政策如下：</p>
        <ul>
          <li>未使用的数字商品可在购买后7天内申请退款</li>
          <li>已使用或下载的商品不予退款</li>
          <li>特殊情况将根据具体情况进行处理</li>
        </ul>
      </section>

      {/* 交付方式 */}
      <section>
        <h2>交付方式</h2>
        <p>所有数字商品将通过以下方式交付：</p>
        <ul>
          <li>电子邮件发送下载链接</li>
          <li>在线访问权限</li>
          <li>即时下载</li>
        </ul>
      </section>

      {/* 使用条款 */}
      <section>
        <h2>使用条款</h2>
        <p>购买我们的数字商品即表示您同意：</p>
        <ul>
          <li>仅用于个人用途</li>
          <li>不得进行二次销售或分发</li>
          <li>遵守所有适用的知识产权法律</li>
        </ul>
      </section>

      {/* 隐私政策 */}
      <section>
        <h2>隐私政策</h2>
        <p>我们重视您的隐私，承诺：</p>
        <ul>
          <li>保护您的个人信息</li>
          <li>不向第三方出售您的数据</li>
          <li>使用安全的支付系统</li>
        </ul>
      </section>
    </div>
  )
} 