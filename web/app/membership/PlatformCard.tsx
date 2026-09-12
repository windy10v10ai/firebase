interface PlatformCardProps {
  title: string;
  price: string;
  subscribeText: string;
  href: string;
}

export default function PlatformCard({ title, price, subscribeText, href }: PlatformCardProps) {
  return (
    <div className="card-container p-6 flex flex-col items-center text-center gap-3">
      <h3 className="title-secondary">{title}</h3>
      <p className="text-content text-2xl font-bold">{price}</p>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block bg-accent-solid hover:bg-accent-solid-hover text-heading font-semibold px-8 py-3 rounded-lg transition-colors duration-200 transform hover:scale-105"
      >
        {subscribeText}
      </a>
    </div>
  );
}
