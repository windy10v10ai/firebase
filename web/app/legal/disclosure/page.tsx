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
          <li>Dota2 10v10 AI 自定义地图内的会员资格</li>
          <li>Dota2 10v10 AI 自定义地图内的会员积分</li>
        </ul>
      </section>

      {/* 价格和支付 */}
      <section>
        <h2>价格和支付</h2>
        <p>所有价格按照当地货币显示，包含适用的税费。</p>
        <p>我们使用Stripe作为支付处理商，确保交易安全。</p>
      </section>

      {/* 退款政策 */}
      <section>
        <h2>退款政策</h2>
        <p>由于数字商品的特殊性，我们的退款政策如下：</p>
        <ul>
          <li>会员资格一经购买，不支持退款</li>
          <li>会员积分一经购买，不支持退款</li>
          <li>特殊情况将根据具体情况进行处理</li>
        </ul>
      </section>

      {/* 交付方式 */}
      <section>
        <h2>交付方式</h2>
        <p>所有数字商品将通过以下方式交付：</p>
        <ul>
          <li>会员资格和会员积分，将在新一局的Dota2 10v10 AI 自定义地图内自动生效。</li>
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