import { CircleCheckBig, TriangleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import Button from '@/app/components/ui/button';

import type { PlatformType } from '../../types/platform';

interface ActiveResultProps {
  activeType: PlatformType;
  errorMsg?: string;
  onRetry: () => void;
  result: boolean;
}

const ActiveResult = ({ activeType, errorMsg, onRetry, result }: ActiveResultProps) => {
  const t = useTranslations('manualActive');
  const router = useRouter();
  const message = result
    ? t('avticeResult.success.message')
    : errorMsg ||
      (activeType === 'afdian'
        ? t('avticeResult.error.afdianMessage')
        : t('avticeResult.error.kofiMessage'));

  return (
    <section className="card-container flex flex-col items-center gap-6 p-6 text-center sm:p-10">
      {result ? (
        <CircleCheckBig aria-hidden="true" className="size-16 text-green-400" strokeWidth={1.5} />
      ) : (
        <TriangleAlert aria-hidden="true" className="size-16 text-amber-400" strokeWidth={1.5} />
      )}
      <p className="whitespace-pre-line text-lg leading-8 text-content">{message}</p>
      <Button onClick={result ? () => router.push('/') : onRetry}>
        {result ? t('avticeResult.success.btnText') : t('avticeResult.error.btnText')}
      </Button>
    </section>
  );
};

export default ActiveResult;
