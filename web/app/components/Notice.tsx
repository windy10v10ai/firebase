interface NoticeProps {
  title: string;
  children?: React.ReactNode;
}

/** 正文区整块换成一条说明：需要登录、资料未公开、读取失败都用它 */
export default function Notice({ title, children }: NoticeProps) {
  return (
    <section className="card-container mx-auto max-w-xl space-y-5 p-6 sm:p-8">
      <h1 className="title-primary">{title}</h1>
      {children}
    </section>
  );
}
