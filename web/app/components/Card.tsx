interface CardProps {
  title: string;
  description: string;
  href: string;
  className?: string;
}

export default function Card({ title, description, href, className = '' }: CardProps) {
  return (
    <a 
      href={href}
      target="_blank" 
      rel="noopener noreferrer"
      className={`block p-6 card-container card-hover ${className}`}
    >
      <h2 className="title-secondary mb-2">{title}</h2>
      <p className="text-content">{description}</p>
    </a>
  );
} 