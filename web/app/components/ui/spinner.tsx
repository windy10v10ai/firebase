import { LoaderCircle } from 'lucide-react';

interface SpinnerProps {
  label: string;
}

const Spinner = ({ label }: SpinnerProps) => {
  return (
    <div
      role="status"
      aria-label={label}
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface/75 backdrop-blur-sm"
    >
      <LoaderCircle aria-hidden="true" className="size-12 animate-spin text-accent" />
    </div>
  );
};

export default Spinner;
