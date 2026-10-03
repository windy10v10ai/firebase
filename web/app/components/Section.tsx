interface SectionProps {
  id?: string;
  title?: string;
  children: React.ReactNode;
  className?: string;
  containerClassName?: string;
  titleClassName?: string;
}

export default function Section({
  id,
  title,
  children,
  className = '',
  containerClassName = '',
  titleClassName = '',
}: SectionProps) {
  return (
    <section id={id} className={`card-container card-pad ${className}`}>
      {title && <h2 className={`title-secondary mb-6 text-center ${titleClassName}`}>{title}</h2>}
      <div className={`max-w-3xl mx-auto ${containerClassName}`}>
        {children}
      </div>
    </section>
  );
} 