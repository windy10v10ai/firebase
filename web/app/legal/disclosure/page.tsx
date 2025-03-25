import Section from '../../components/Section';

interface DisclosureItem {
  title: string;
  content: React.ReactNode;
}

export default function DisclosurePage() {
  const disclosureItems: DisclosureItem[] = [
    {
      title: "法定名称",
      content: "Windy10v10ai（个人）"
    },
    {
      title: "地址",
      content: "如有需要，我们会立即披露"
    },
    {
      title: "电话号码",
      content: "如有需要，我们会立即披露"
    },
    {
      title: "邮箱地址",
      content: "windy10v10ai@gmail.com"
    },
    {
      title: "运营主管",
      content: "Windy"
    },
    {
      title: "其他费用",
      content: (
        <ul className="list-disc pl-5 space-y-2">
          <li>支付手续费：根据支付方式收取相应费用</li>
        </ul>
      )
    },
    {
      title: "退换货政策",
      content: (
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold mb-2">会员服务退订</h4>
            <ul className="list-disc pl-5 space-y-2">
              <li>您可以随时在账户设置中取消会员订阅</li>
              <li>取消后，您可以继续使用到当前订阅期结束</li>
              <li>已使用的会员服务不予退款</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-2">特殊情况</h4>
            <p>如遇特殊情况，我们将根据具体情况进行处理</p>
          </div>
        </div>
      )
    },
    {
      title: "服务提供时间",
      content: "订阅支付成功后即可立即使用会员服务"
    },
    {
      title: "接受的支付方式",
      content: (
        <ul className="list-disc pl-5 space-y-2">
          <li>支付宝</li>
          <li>微信支付</li>
          <li>信用卡支付</li>
        </ul>
      )
    },
    {
      title: "付款周期",
      content: "支付宝，微信和信用卡支付均为即时到账，会员服务将在支付成功后立即生效"
    },
    {
      title: "价格",
      content: (
        <ul className="list-disc pl-5 space-y-2">
          <li>10v10AI 会员订阅：¥30/月</li>
        </ul>
      )
    }
  ];

  return (
    <div className="space-y-8">
      <h1 className="title-primary mb-6">商业披露</h1>
      <p className="text-content mb-8">
        根据《特定商业交易法》要求，我们在此披露以下商业信息。
      </p>
      
      <div className="space-y-6">
        {disclosureItems.map((item, index) => (
          <Section key={index} className="!p-6">
            <div className="space-y-2">
              <h3 className="title-secondary !text-left !mb-2">{item.title}</h3>
              <div className="text-content">
                {item.content}
              </div>
            </div>
          </Section>
        ))}
      </div>

      <p className="text-content text-sm mt-8">
        最后更新日期：2025年3月26日
      </p>
    </div>
  )
} 