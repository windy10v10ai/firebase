interface PlatformCardProps {
  title: string;
  price: string;
  subscribeText: string;
  href: string;
}

export default function PlatformCard({ title, price, subscribeText, href }: PlatformCardProps) {
  return (
    <div className="card-container p-6 flex flex-col items-center text-center gap-3">
      <h3 className="title-secondary text-member-strong">{title}</h3>
      <p className="text-member text-xl font-bold">{price}</p>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-member px-8"
      >
        {subscribeText}
      </a>
    </div>
  );
}
