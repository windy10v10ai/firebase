interface SectionProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
  containerClassName?: string;
}

export default function Section({ title, children, className = '', containerClassName = '' }: SectionProps) {
  return (
    <section className={`card-container p-8 ${className}`}>
      {title && <h2 className="title-secondary mb-6 text-center">{title}</h2>}
      <div className={`max-w-3xl mx-auto ${containerClassName}`}>
        {children}
      </div>
    </section>
  );
} 